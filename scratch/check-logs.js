import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure()?.errorText));
  
  await page.goto('http://localhost:8080/family-ledger/');
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Try to login
  await page.type('#auth-email', 'test@example.com');
  await page.type('#auth-password', 'password123');
  await page.click('button[type="submit"]');
  
  await new Promise(r => setTimeout(r, 3000));
  
  await browser.close();
})();
