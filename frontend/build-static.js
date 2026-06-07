const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const apiPath = path.join(__dirname, 'src/app/api');
const tempPath = path.join(__dirname, 'src/api-temp');

let moved = false;
try {
  if (fs.existsSync(apiPath)) {
    fs.renameSync(apiPath, tempPath);
    moved = true;
    console.log('Temporarily moved API routes out of src/app for static build...');
  }
  
  console.log('Running: next build');
  execSync('next build', { stdio: 'inherit' });
  console.log('Static export completed successfully!');
  
} catch (error) {
  if (error.code === 'EPERM') {
    console.error('\n❌ ERROR: Access Denied (EPERM) during build.');
    console.error('👉 If your local dev server ("npm run dev") is running in another terminal, please stop it (Ctrl + C) and try building again.');
    console.error('Windows locks the "src/app/api" folder while Next.js dev server is actively watching it.\n');
  } else {
    console.error('Build execution failed:', error.message);
  }
  process.exitCode = 1;
} finally {
  if (moved && fs.existsSync(tempPath)) {
    fs.renameSync(tempPath, apiPath);
    console.log('Restored API routes back to src/app/api.');
  }
}
