app.post('/sii-navigate', async (req, res) => {
  try {
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html');
    
    // Solo login
    await page.type('input[name*="rutcntr"]', '8480442-8');
    await page.type('input[type="password"]', 'Ea978006');
    await page.click('input[type="submit"]');
    
    await page.waitForNavigation({timeout: 30000});
    
    const finalUrl = page.url();
    await browser.close();
    
    res.json({ success: true, finalUrl });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});
