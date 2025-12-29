const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));

app.post('/sii-navigate', async (req, res) => {
  const { url, rutautorizado, password, rutemisor } = req.body;
  
  console.log('📥 Recibido:', { rutautorizado, rutemisor });
  
  try {
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // ✅ USER-AGENT real
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // ✅ PASO 1: URL BASE SII (SIN query params raros)
    console.log('🌐 Paso 1: Página login SII');
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    await page.waitForTimeout(3000);
    
    // LOGIN
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForTimeout(10000);
    
    // ✅ PASO 2: Continuar
    await page.waitForSelector('a:has-text("Continuar")', { timeout: 10000 });
    await page.click('a:has-text("Continuar")');
    await page.waitForTimeout(5000);
    
    // Navegación completa
    await page.waitForSelector('a:has-text("Servicios online")');
    await page.click('a:has-text("Servicios online")');
    await page.click('a:has-text("Boletas de honorarios electrónicas")');
    await page.click('a:has-text("Emisor de boleta de honorarios")');
    await page.click('a:has-text("Emitir boleta de honorarios electrónica")');
    
    await page.click('a:has-text("Por usuario autorizado con datos usados anteriormente")');
    await page.waitForTimeout(5000);
    
    await page.waitForSelector(`a:has-text("${rutemisor}")`, { timeout: 15000 });
    await page.click(`a:has-text("${rutemisor}")`);
    await page.waitForTimeout(5000);
    
    const finalUrl = page.url();
    await browser.close();
    
    console.log('✅ FINAL:', finalUrl);
    res.json({ success: true, finalUrl });
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    res.json({ success: false, error: error.message });
  }
});

app.listen(3000, () => console.log('🤖 Robot SII listo!'));
