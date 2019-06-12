# CF Worker

```js
const worker = require('./cfworker.js');

// then you create instance

const w = new Worker('proxy', 'link');

// then solve the challenge
await worker.getNewCfToken();

// then you can get the request options from the worker

console.dir(w.requestOptions.headers)
```


Edit some settings in `config.js`