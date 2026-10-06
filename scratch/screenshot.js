import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:8080/family-ledger/');
  await new Promise(r => setTimeout(r, 2000));
  
  // Try to login
  await page.type('input[type="email"]', 'test@family.com');
  await page.type('input[type="password"]', 'hashed_pwd');
  await page.click('button[type="submit"]');
  
  await new Promise(r => setTimeout(r, 4000));
  await page.goto('http://localhost:8080/family-ledger/transactions');
  await new Promise(r => setTimeout(r, 4000));
  
  await page.screenshot({ path: 'scratch/screenshot_transactions.png' });
  
  console.log("Screenshot taken.");
  
  await browser.close();
})();
