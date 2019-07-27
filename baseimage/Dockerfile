# A minimal Docker image with Node and Puppeteer
#
# Based upon:
# https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md#running-puppeteer-in-docker

FROM node:12.7.0-stretch

RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-unstable xvfb libnss3 libx11-xcb1 fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst ttf-freefont \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# If running Docker >= 1.13.0 use docker run's --init arg to reap zombie processes, otherwise
# uncomment the following lines to have `dumb-init` as PID 1
ADD https://github.com/Yelp/dumb-init/releases/download/v1.2.0/dumb-init_1.2.0_amd64 /usr/local/bin/dumb-init
RUN chmod +x /usr/local/bin/dumb-init
ENTRYPOINT ["dumb-init", "--"]

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV CHROME_BIN=/usr/bin/google-chrome-unstable
ENV CHROME_PATH=/usr/bin/google-chrome-unstable

# Puppeteer v1.12.2 works with Chromium 73.
RUN yarn add puppeteer@1.19
RUN yarn add lighthouse@5.2.0
RUN yarn add chrome-launcher@0.10.4

RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /node_modules \
    && mkdir /app \
    && chown -R pptruser:pptruser /app

WORKDIR "/app"

# Run everything after as non-privileged user.
USER pptruser

