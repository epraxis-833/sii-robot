const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ extended: true })); // Importante para recibir datos de Guzzle

app.post('/sii-navigate', async (req, res) => {
  // Nota: Laravel Guzzle envía a veces como form_params, extraemos de req.body
  const { url, rutautorizado, password, rutemisor } = req.body;
  
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: "new", // Modo optimizado
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process' // Recomendado para Railway
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 1. LOGIN
    await page.goto(url || 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    await page.waitForSelector('input[name*="rutcntr"]');
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    
    // Click y esperar navegación
    await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // 2. Navegación por menús (Uso de XPath para mayor precisión con el texto)
    const navegarYClick = async (texto) => {
        const linkEx = `//a[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "${texto.toLowerCase()}")]`;
        await page.waitForXPath(linkEx, { visible: true, timeout: 10000 });
        const [link] = await page.$x(linkEx);
        await Promise.all([
            link.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}) 
        ]);
    };

    await navegarYClick("Continuar");
    await navegarYClick("Servicios online");
    await navegarYClick("Boletas de honorarios electrónicas");
    await navegarYClick("Emisor de boleta de honorarios");
    await navegarYClick("Emitir boleta de honorarios electrónica");
    await navegarYClick("Por usuario autorizado con datos usados anteriormente");

    // Click en el RUT del emisor específico
    await navegarYClick(rutemisor);
    
    const finalUrl = page.url();
    await browser.close();
    
    res.json({ success: true, finalUrl });
    
  } catch (error) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: error.message });
  }
});

// Railway asigna el puerto automáticamente en process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Robot SII en puerto ${PORT}`));
