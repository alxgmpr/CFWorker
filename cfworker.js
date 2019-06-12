const puppeteer = require('puppeteer');
const axios = require('axios');
const util = require('util');
const request = util.promisify(require('request'));
const chalk = require('chalk');
const uuidv4 = require('uuid/v4');
const HttpsProxyAgent = require('https-proxy-agent');
const config = require('./config.js');

require('console-stamp')(console, {
  pattern: 'HH:MM:ss.l',
  colors: {
    stamp: chalk.cyan,
  },
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
        DNT: '1',
        'User-Agent': config.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
      },
    };

    this.pptrOptions = {
      headless: true,
      ignoreHTTPSErrors: true,
    };

    this.requestOptions = {
      headers: {
        'Upgrade-Insecure-Requests': '1',
        DNT: '1',
        'User-Agent': config.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
      },
    };

    if (proxy) {
      const proxySplit = proxy.split(':');
      this.axiosOptions.httpsAgent = new HttpsProxyAgent(`http://${proxy}`);

      switch (proxySplit.length) {
        case 2:
          this.pptrOptions.args = [`--proxy-server=${proxy}`];
          this.requestOptions.proxy = `http://${proxy}`;
          break;
        case 4:
          this.pptrOptions.args = [`http://${proxySplit[2]}:${proxySplit[3]}@${proxySplit[0]}:${proxySplit[1]}`];
          this.requestOptions.proxy = `http://${proxySplit[2]}:${proxySplit[3]}@${proxySplit[0]}:${proxySplit[1]}`;
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
    return undefined;
  }

  error(text) {
    if (config.verbose) {
      return console.error(`[${chalk.red(this.uuid)}] CF: ${text}`);
    }
    return undefined;
  }

  async getNewCfToken() {
    try {
      this.log('Starting token generator');
      const browser = await puppeteer.launch(this.pptrOptions);
      const context = await browser.createIncognitoBrowserContext();
      const page = await context.newPage();
      await page.setExtraHTTPHeaders({
        'cache-control': 'max-age=0',
        'accept-language': 'en-US,en;q=0.9',
      });
      await page.setUserAgent(config.userAgent);
      await page.setBypassCSP(true);
      await page.setJavaScriptEnabled(true);
      await page.setViewport({ width: 1440, height: 766 });
      await page.goto(this.link)
        .then(async (response) => {
          this.log(`Initial status: ${await response.headers().status}`);
        });
      this.log(`Waiting ${config.sleepTime}ms`);
      await page.waitFor(config.sleepTime);
      await page.reload()
        .then(async (response) => {
          const statusCode = await response.headers().status;
          this.log(`Status after refresh: ${statusCode}`);
          if (statusCode === '200') {
            this.log('Stealing cookies');
            this.cookies = await page.cookies();
            this.cookieString = `__cf_bm=${this.cookies.filter(c => c.name === '__cf_bm')[0].value}; __cfduid=${this.cookies.filter(c => c.name === '__cfduid')[0].value}`;

            // axios
            this.transport.defaults.headers.cookie = this.cookieString;

            // requests
            this.requestOptions.headers.Cookie = this.cookieString;
            // return
            await browser.close();
            return Promise.resolve();
          }
          this.error(`Didnt get 200 status after refresh: ${statusCode}`);

          // return
          await browser.close();
          return Promise.reject(new Error(`Didnt get 200 status after refresh: ${statusCode}`));
        })
        .catch(e => Promise.reject(e));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async runAxiosTest() {
    this.log('Running Axios test');
    await this.transport.request({
      method: 'get',
      url: this.link,
      responseType: 'document',
    })
      .catch((e) => {
        this.error('Request failed 😭');
        return Promise.reject(e);
      })
      .then((res) => {
        if (res.status && res.status === 200) {
          this.log('Axios response: 200');
          return Promise.resolve();
        }
        return Promise.reject(new Error(`Unexpected response from Axios request: ${res.status}`));
      });
  }

  async runRequestTest() {
    this.log('Running request test');
    await request(this.link, this.requestOptions)
      .catch((e) => {
        this.error('Request failed 😭');
        return Promise.reject(e);
      })
      .then(({ statusCode }) => {
        this.log(`Request response: ${statusCode}`);
        if (statusCode === 200) {
          return Promise.resolve();
        }
        return Promise.reject(new Error(`Unexpected response from request request: ${statusCode}`));
      });
  }
}

module.exports = CFWorker;

// (async () => {
//   try {
//     const worker = new CFWorker('localhost:8888', 'https://www.sneakersnstuff.com/en/product/36523/jordan-brand-wmns-air-jordan-1-high-og');
//     await worker.getNewCfToken()
//       .catch((e) => {
//         console.error(e);
//         console.error('Getting new CF token failed');
//       });
//     console.dir(worker.requestOptions);
//     await request('https://www.sneakersnstuff.com/en/product/36541/jordan-brand-air-jordan-1-retro-high-og-gs', worker.requestOptions)
//       .then(({statusCode}) => {
//         console.log(`test: ${statusCode}`)
//     });
//     // await worker.runAxiosTest()
//     //   .catch((e) => {
//     //     console.error(e);
//     //     console.error('Axios test failed');
//     //   });
//     // await worker.runRequestTest()
//     //   .catch((e) => {
//     //     console.error(e);
//     //     console.error('Request test failed');
//     //   });
//   } catch (e) {
//     console.error(e);
//   }
// })();
