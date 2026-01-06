const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));

app.post('/sii-navigate', async (req, res) => {
  const { rutautorizado, password, rutemisor } = req.body;
  let browser;
  
  try {
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 1024 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 1. LOGIN (Pauses exactos de tu código PHP)
    console.log("🔑 Iniciando sesión...");
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 5000));

    await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 50 });
    await new Promise(r => setTimeout(r, 1500));
    await page.type('input[type="password"]', password, { delay: 50 });
    await new Promise(r => setTimeout(r, 1500));
    
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);
    await new Promise(r => setTimeout(r, 5000));

    // FUNCIÓN REPLICADA DE Dusk ->clickLink()
    const duskClick = async (text, isOptional = false) => {
        console.log(`🖱️ clickLink: ${text}`);
        
        // Limpiar modales antes de cada acción (Video 0:34)
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a, span'));
            const close = btns.find(b => b.innerText.toLowerCase().includes('cerrar') || b.innerText === 'x');
            if (close) close.click();
            document.querySelectorAll('.modal-backdrop, .modal').forEach(m => m.remove());
        }).catch(() => {});

        const clicked = await page.evaluate((t) => {
            const anchors = Array.from(document.querySelectorAll('a, button, span, li'));
            const target = anchors.find(a => a.innerText.trim().includes(t));
            if (target) {
                target.scrollIntoView();
                target.click();
                return true;
            }
            return false;
        }, text);

        if (clicked) {
            await new Promise(r => setTimeout(r, 3000)); // pause(3000) de tu código
            return true;
        } else if (!isOptional) {
            throw new Error(`Dusk no halló el link: ${text}`);
        }
        return false;
    };

    // 2. NAVEGACIÓN (Textos exactos de tu Dusk local)
    await duskClick('Continuar', true); 
    await duskClick('Servicios online');
    await duskClick('Boletas de honorarios electrónicas');
    await duskClick('Emisor de boleta de honorarios');
    await duskClick('Emitir boleta de honorarios electrónica');
    await duskClick('Por usuario autorizado con datos usados anteriormente');

    // 3. SELECCIÓN DEL RUT EMISOR (Paso crítico)
    console.log(`🎯 Buscando emisor en tabla: ${rutemisor}`);
    
    // Espera dinámica hasta que aparezca la tabla o el RUT (Máximo 15 seg)
    await page.waitForFunction((rut) => {
        const cleanTarget = rut.replace(/\D/g, '');
        const links = Array.from(document.querySelectorAll('a'));
        return links.some(l => l.innerText.replace(/\D/g, '') === cleanTarget);
    }, { timeout: 15000 }, rutemisor).catch(() => console.log("⏳ Tiempo de espera de tabla agotado, intentando clic..."));

    const rutSelected = await page.evaluate((rut) => {
        const cleanTarget = rut.replace(/\D/g, '');
        const links = Array.from(document.querySelectorAll('a'));
        const match = links.find(l => l.innerText.replace(/\D/g, '') === cleanTarget);
        if (match) {
            match.click();
            return true;
        }
        return false;
    }, rutemisor);

    if (!rutSelected) {
        const bodyPreview = await page.evaluate(() => document.body.innerText.substring(0, 300));
        throw new Error(`RUT ${rutemisor} no encontrado en la tabla final. Texto en pantalla: ${bodyPreview}`);
    }

    await new Promise(r => setTimeout(r, 5000)); // pause(5000) final de tu código
    
    console.log("✅ Navegación Dusk exitosa.");
    res.json({ success: true, finalUrl: page.url() });
    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ ERROR: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
