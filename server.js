const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ extended: true }));

app.post('/sii-navigate', async (req, res) => {
  // Extraemos datos del cuerpo de la petición
  const { url, rutautorizado, password, rutemisor } = req.body;
  
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: "new",
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 1. LOGIN SII
    const targetUrl = url || 'https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html';
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    await page.waitForSelector('input[name*="rutcntr"]');
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    
    await Promise.all([
        page.click('button[type="submit"], input[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // Función para navegar por texto (más estable que selectores CSS que cambian)
    const clickLinkByText = async (text) => {
        const xpath = `//a[contains(translate(., 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ', 'abcdefghijklmnñopqrstuvwxyz'), '${text.toLowerCase()}')]`;
        await page.waitForXPath(xpath, { visible: true, timeout: 15000 });
        const [link] = await page.$x(xpath);
        await Promise.all([
            link.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
        ]);
    };

    // 2. Proceso de navegación
    await clickLinkByText("Continuar");
    await clickLinkByText("Servicios online");
    await clickLinkByText("Boletas de honorarios electrónicas");
    await clickLinkByText("Emisor de boleta de honorarios");
    await clickLinkByText("Emitir boleta de honorarios electrónica");
    await clickLinkByText("Por usuario autorizado con datos usados anteriormente");

    // 3. Selección del RUT emisor
    await clickLinkByText(rutemisor);
    
    const finalUrl = page.url();
    await browser.close();
    
    res.json({ success: true, finalUrl });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error("Error Robot:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Robot SII listo en puerto ${PORT}`));
