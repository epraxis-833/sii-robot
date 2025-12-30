const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));

app.post('/sii-navigate', async (req, res) => {
  const { rutautorizado, password, rutemisor } = req.body;
  console.log(`Recibida petición para RUT: ${rutautorizado}`);
  
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // 1. LOGIN
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[name*="rutcntr"]');
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    
    await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // Función auxiliar para navegar por texto
    const clickByText = async (text) => {
        const xpath = `//a[contains(., "${text}")]`;
        await page.waitForXPath(xpath, { visible: true });
        const [link] = await page.$x(xpath);
        await Promise.all([
            link.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
        ]);
    };

    // 2. Proceso de navegación
    await clickByText("Continuar");
    await clickByText("Servicios online");
    await clickByText("Boletas de honorarios electrónicas");
    await clickByText("Emisor de boleta de honorarios");
    await clickByText("Emitir boleta de honorarios electrónica");
    await clickByText("Por usuario autorizado con datos usados anteriormente");
    
    // 3. Selección RUT Emisor
    await clickByText(rutemisor);
    
    const finalUrl = page.url();
    await browser.close();
    res.json({ success: true, finalUrl });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error("Error en el proceso:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// CAMBIO CRÍTICO: Railway usa process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🤖 Robot escuchando en puerto ${PORT}`));
