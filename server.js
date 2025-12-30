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
    
    // User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // 1. LOGIN SII
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { 
      waitUntil: 'networkidle0' 
    });
    
    // Espera formulario + login
    await page.waitForSelector('input[name*="rutcntr"]');
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    await page.click('button[type="submit"], input[type="submit"]');
    
    // 2. Espera "Continuar" + click
    await page.waitForSelector('a:has-text("Continuar")');
    await page.click('a:has-text("Continuar")');
    
    // 3. Navegación MENÚ (espera cada link antes de click)
    await page.waitForSelector('a:has-text("Servicios online")');
    await page.click('a:has-text("Servicios online")');
    
    await page.waitForSelector('a:has-text("Boletas de honorarios electrónicas")');
    await page.click('a:has-text("Boletas de honorarios electrónicas")');
    
    await page.waitForSelector('a:has-text("Emisor de boleta de honorarios")');
    await page.click('a:has-text("Emisor de boleta de honorarios")');
    
    await page.waitForSelector('a:has-text("Emitir boleta de honorarios electrónica")');
    await page.click('a:has-text("Emitir boleta de honorarios electrónica")');
    
    // 4. RUT emisor
    await page.waitForSelector('a:has-text("Por usuario autorizado con datos usados anteriormente")');
    await page.click('a:has-text("Por usuario autorizado con datos usados anteriormente")');
    
    await page.waitForSelector(`a:has-text("${rutemisor}")`);
    await page.click(`a:has-text("${rutemisor}")`);
    
    // Final
    const finalUrl = page.url();
    await browser.close();
    
    res.json({ success: true, finalUrl });
    
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.listen(3000, () => console.log('🤖 Robot SII listo!'));
