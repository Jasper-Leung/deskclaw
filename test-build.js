import { app, protocol } from 'electron';
import path from 'path';
import fs from 'fs';

app.whenReady().then(() => {
  const appPath = app.getAppPath();
  const nextStaticDir = path.join(appPath, 'next', '.next', 'static');
  const nextServerDir = path.join(appPath, 'next', '.next', 'server');

  console.log('App Path:', appPath);
  console.log('Static Dir:', nextStaticDir);
  console.log('Server Dir:', nextServerDir);
  console.log('Static Dir Exists:', fs.existsSync(nextStaticDir));
  console.log('Server Dir Exists:', fs.existsSync(nextServerDir));

  const indexPath = path.join(nextServerDir, 'app', 'index.html');
  console.log('Index Path:', indexPath);
  console.log('Index Exists:', fs.existsSync(indexPath));

  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf8');
    const hasNextStatic = content.includes('_next/static');
    console.log('Has _next/static:', hasNextStatic);
    console.log('First 200 chars:', content.substring(0, 200));
  }

  app.quit();
});
