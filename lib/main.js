const puppeteer = require('puppeteer');

const axios = require('axios');

const request = require('request');

const chalk = require('chalk');

const uuidv4 = require('uuid/v4');

const HttpsProxyAgent = require('https-proxy-agent');

const config = require('./config.js');

require('console-stamp')(console, {
  pattern: 'HH:MM:ss.l',
  colors: {
    stamp: chalk.cyan
  }
});

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

class CFWorker {
  constructor(proxy, link) {
    this.link = link;
    this.uuid = Buffer.from(uuidv4().replace(/-/g, '').slice(0, 8)).toString('base64');
    this.axiosOptions = {
      withCredentials: true,
      headers: {
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1',
        'User-Agent': config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate'
      }
    };
    this.pptrOptions = {
      headless: true,
      ignoreHTTPSErrors: true
    };
    this.requestOptions = {};

    if (proxy) {
      const proxySplit = proxy.split(':');
      axiosOptions.httpsAgent = new HttpsProxyAgent(`http://${proxy}`);

      switch (proxySplit.length) {
        case 2:
          this.pptrOptions.args = [`--proxy-server=${proxy}`];
          break;

        case 4:
          this.pptrOptions.args = [`http://${proxySplit[2]}:${proxySplit[3]}@${proxySplit[0]}:${proxySplit[1]}`];
          break;

        default:
          this.error(`Unsupported proxy format ${proxy}`);
      }
    }

    this.transport = axios.create(this.axiosOptions);
  }

  log(text) {
    if (config.verbose) {
      return console.log(`[${this.uuid}] CF: ${text}`);
    }
  }

  error(text) {
    if (config.verbose) {
      return console.error(`[${chalk.red(this.uuid)}] CF: ${text}`);
    }
  }

  async getNewCfToken() {
    try {
      this.log('Starting token generator');
      const browser = await puppeteer.launch(this.pptrOptions);
      const context = await browser.createIncognitoBrowserContext();
      const page = await context.newPage();
      await page.setExtraHTTPHeaders({
        'cache-control': 'max-age=0',
        'accept-language': 'en-US,en;q=0.9'
      });
      await page.setUserAgent(config.userAgent);
      await page.setBypassCSP(true);
      await page.setJavaScriptEnabled(true);
      await page.setViewport({
        width: 1440,
        height: 766
      });
      await page.goto(this.link).then(async response => {
        this.log(`Initial status: ${await response.headers().status}`);
      });
      this.log(`Waiting ${config.sleepTime}ms`);
      await page.waitFor(config.sleepTime);
      await page.reload().then(async response => {
        const statuscode = await response.headers().status;
        this.log(`Status after refresh: ${statuscode}`);

        if (statuscode === '200') {
          this.log('Stealing cookies');
          this.cookies = await page.cookies(); // axios

          this.transport.defaults.headers['cookie'] = `__cf_bm=${this.cookies.filter(c => c.name === '__cf_bm')[0].value}; __cfduid=${this.cookies.filter(c => c.name === '__cfduid')[0].value}`; // requests
          // return

          await browser.close();
          return Promise.resolve();
        } else {
          this.error(`Didnt get 200 status after refresh: ${statuscode}`); // return

          await browser.close();
          return Promise.reject(`Didnt get 200 status after refresh: ${statuscode}`);
        }
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async runAxiosTest() {
    await this.getNewCfToken().catch(() => {
      this.error('Failed to get cf token');
      return Promise.reject();
    });
    await this.transport.request({
      method: 'get',
      url: this.link,
      responseType: 'document'
    }).catch(e => {
      this.error('Request failed 😭');
      return Promise.reject(e);
    }).then(res => {
      if (res.status && res.status === 200) {
        return Promise.resolve();
      } else {
        return Promise.reject(`Unexpected response from Axios request: ${res.status}`);
      }
    });
  }

}

try {
  const worker = new CFWorker('localhost:8888', 'https://www.sneakersnstuff.com/en/product/36523/jordan-brand-wmns-air-jordan-1-high-og');
  worker.runAxiosTest().catch(e => {
    console.error(e);
    console.error('Failed');
  });
} catch (e) {
  console.error(e);
}