const puppeteer = require('puppeteer');
const lighthouse = require('lighthouse');
const fs = require('fs');
const ReportGenerator = require('lighthouse/lighthouse-core/report/report-generator');
const config = require('./config.json');
const MongoClient = require('mongodb').MongoClient;
const Minio = require('minio')

let browser;
let mongoDBClient;
let mongoDBDatabase;
let minioClient;

function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time)
    });
}

async function getSitesList(){
    return new Promise((resolve, reject) => {
        const uri = 'mongodb://'+config.mongodb.user+':'+config.mongodb.password+'@'+config.mongodb.host+':'+config.mongodb.port+'/'+config.mongodb.database;
        return MongoClient.connect(uri, { useNewUrlParser: true }, function(err, client) {
            if(err != null){
                console.log(err);
                return []
            }
            console.log("Connected successfully to server");
            mongoDBClient = client;

            mongoDBDatabase = client.db(config.mongodb.database);
            mongoDBDatabase
                .collection("sites")
                .find({})
                .toArray(function(err, data) {
                    err
                        ? reject(err)
                        : resolve(data);
                });
        });
    })

}
async function runSitesLightHouse(sites){
    for (let i = 0; i < sites.length; i++) {
        let site = sites[i];
        console.log("Lighthouse start "+site.name);
        try {
            let remoteReportPath = site._id + '.html';
            let publicUrl = "https://" + config.minio.host + "/" + config.minio.bucket + "/" + remoteReportPath;

            const {lhr} = await lighthouse(site.url, {
                port: (new URL(browser.wsEndpoint())).port
            },{
                extends: 'lighthouse:default',
                settings: {
                    emulatedFormFactor: 'desktop',
                    throttlingMethod: 'provided',
                },
            });
            let performanceScore = 0;
            if(lhr.categories["performance"] !== undefined && lhr.categories["performance"].score !== undefined )
                performanceScore = lhr.categories["performance"].score*100;

            let accessibilityScore = 0;
            if(lhr.categories["accessibility"] !== undefined && lhr.categories["accessibility"].score !== undefined )
                accessibilityScore = lhr.categories["accessibility"].score*100;

            let bestPracticesScore = 0;
            if(lhr.categories["best-practices"] !== undefined && lhr.categories["best-practices"].score !== undefined )
                bestPracticesScore = lhr.categories["best-practices"].score*100;

            let seoScore = 0;
            if(lhr.categories["seo"] !== undefined && lhr.categories["seo"].score !== undefined )
                seoScore = lhr.categories["seo"].score*100;

            let pwaScore = 0;
            if(lhr.categories["pwa"] !== undefined && lhr.categories["pwa"].score !== undefined )
                pwaScore = lhr.categories["pwa"].score*100;

            const html = ReportGenerator.generateReport(lhr, 'html');
            await minioClient.putObject(config.minio.bucket, remoteReportPath, html,{'Content-Type':"text/html"});
            await mongoDBDatabase.collection("sites").findOneAndUpdate(
                { "_id" : site._id },
                { $set : {
                        "lighthouse_url": publicUrl,
                        "lighthouse_performance": performanceScore,
                        "lighthouse_accessibility": accessibilityScore,
                        "lighthouse_bestPractices": bestPracticesScore,
                        "lighthouse_seo": seoScore,
                        "lighthouse_pwa": pwaScore,
                        "lighthouse_dateTime": Math.floor(Date.now()/1000),
                        "lighthouse_error": ''
                    }
                }
            );
        } catch (error) {
            console.log(site.name);
            console.log(error.toString());

            await mongoDBDatabase.collection("sites").findOneAndUpdate(
                { "_id" : site._id },
                { $set : {
                        "lighthouse_url": '',
                        "lighthouse_performance": 0,
                        "lighthouse_accessibility": 0,
                        "lighthouse_bestPractices": 0,
                        "lighthouse_seo": 0,
                        "lighthouse_pwa": 0,
                        "lighthouse_dateTime": Math.floor(Date.now()/1000),
                        "lighthouse_error": error.toString()
                    }
                }
            );
        }
        console.log("Lighthouse end "+site.name+" "+site._id+" "+site._id);
    }
}

async function runSitesScreenshot(sites){
    for (let i = 0; i < sites.length; i++) {
        let site = sites[i];
        console.log("Screenshot start "+site.name);
        let page = await browser.newPage();
        try {
            let localScreenPath = './screenshot/'+site._id+'.jpg';
            let remoteScreenPath = site._id+'.jpg';
            let publicUrl = "https://"+config.minio.host+"/"+config.minio.bucket+"/"+remoteScreenPath;

            await page.goto(site.url);
            await delay(500); //permet d'attendre encore un peu, certains effets CSS restent encore à l'écran
            await page.screenshot({ path: localScreenPath, type: 'jpeg' });
            await minioClient.fPutObject(config.minio.bucket, remoteScreenPath, localScreenPath);
            fs.unlinkSync(localScreenPath);

            await mongoDBDatabase.collection("sites").findOneAndUpdate(
                { "_id" : site._id },
                { $set : {
                        "screenshot_url": publicUrl,
                        "screenshot_dateTime": Math.floor(Date.now()/1000),
                        "screenshot_error": ''
                    }
                }
            );
        } catch (error) {
            console.log(site.name);
            console.log(error.toString());

            await mongoDBDatabase.collection("sites").findOneAndUpdate(
                { "_id" : site._id },
                { $set : {
                        "screenshot_url": '',
                        "screenshot_dateTime": Math.floor(Date.now()/1000),
                        "screenshot_error": error.toString()
                    }
                }
            );
        }
        await page.close();
        console.log("Screenshot end "+site.name+" "+site._id);
    }
}
async function run() {
    //start browser
    browser = await puppeteer.launch({
        headless: true,
        executablePath: config.chromePath,
        defaultViewport: { width: config.screenWidth, height: config.screenHeight },
        args: ['--lang=fr-FR,fr','--disable-dev-shm-usage','--no-sandbox','--disable-setuid-sandbox','--safebrowsing-disable-auto-update','--disable-translate','--disable-features=TranslateUI']
    });

    minioClient = new Minio.Client({
        endPoint: config.minio.host,
        useSSL: config.minio.useSSL,
        accessKey: config.minio.accessKey,
        secretKey: config.minio.secretKey
    });
    let listSites = await getSitesList();
    await runSitesScreenshot(listSites);
    await runSitesLightHouse(listSites);

    if(mongoDBClient)
        mongoDBClient.close();
    await browser.close();
}

run();