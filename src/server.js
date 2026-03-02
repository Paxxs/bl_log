import { createApp } from './app.js';

const app = createApp();

app.listen(3000, '127.0.0.1', () => {
  console.log('listening on http://127.0.0.1:3000');
});
