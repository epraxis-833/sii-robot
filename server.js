const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));

app.post('/sii-navigate', async (req, res) => {
  const { url, rutautorizado, password, rutemisor } = req.body;
  
  try {
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // TU NAVEGACIÓN EXACTA
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForTimeout(5000);
    
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    await page.waitForTimeout(3000);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForTimeout(5000);
    
    await page.waitForSelector('a:has-text("Continuar")');
    await page.click('a:has-text("Continuar")');
    await page.waitForTimeout(3000);
    
    await page.click('a:has-text("Servicios online")');
    await page.click('a:has-text("Boletas de honorarios electrónicas")');
    await page.click('a:has-text("Emisor de boleta de honorarios")');
    await page.click('a:has-text("Emitir boleta de honorarios electrónica")');
    
    await page.click('a:has-text("Por usuario autorizado con datos usados anteriormente")');
    await page.waitForSelector(`a:has-text("${rutemisor}")`, { timeout: 15000 });
    await page.click(`a:has-text("${rutemisor}")`);
    
    const finalUrl = page.url();
    await browser.close();
    
    res.json({ success: true, finalUrl });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.listen(3000, () => console.log('🤖 Robot SII listo!'));
