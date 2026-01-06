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

    // 1. LOGIN (Simulando tus pauses de 1500ms y 5000ms)
    console.log("🔑 Iniciando sesión...");
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 5000));

    await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 50 });
    await new Promise(r => setTimeout(r, 1500));
    await page.type('input[type="password"]', password, { delay: 50 });
    await new Promise(r => setTimeout(r, 1500));
    
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    await new Promise(r => setTimeout(r, 5000));

    // FUNCIÓN PARA REPLICAR clickLink() DE DUSK
    const duskClick = async (text, timeout = 10) => {
        console.log(`🖱️ clickLink: ${text}`);
        // Limpiamos avisos antes de buscar el texto (como el modal del 14.5%)
        await page.evaluate(() => {
            const modalBtn = Array.from(document.querySelectorAll('button, a')).find(b => b.innerText.includes('Cerrar'));
            if (modalBtn) modalBtn.click();
        }).catch(() => {});

        const clicked = await page.evaluate((t) => {
            const anchors = Array.from(document.querySelectorAll('a, button, span'));
            const target = anchors.find(a => a.innerText.trim().includes(t));
            if (target) {
                target.scrollIntoView();
                target.click();
                return true;
            }
            return false;
        }, text);

        if (!clicked) throw new Error(`Dusk no encontró el texto: ${text}`);
        await new Promise(r => setTimeout(r, 3000)); // Pause(3000) de tu código
    };

    // 2. NAVEGACIÓN (Réplica exacta de tus comandos Dusk)
    await duskClick('Continuar');
    await duskClick('Servicios online');
    await duskClick('Boletas de honorarios electrónicas');
    await duskClick('Emisor de boleta de honorarios');
    await duskClick('Emitir boleta de honorarios electrónica');
    await duskClick('Por usuario autorizado con datos usados anteriormente');

    // 3. SELECCIÓN DEL RUT EMISOR
    console.log(`🎯 Buscando link del RUT: ${rutemisor}`);
    await new Promise(r => setTimeout(r, 5000)); // SII carga lento en este paso

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

    if (!rutSelected) throw new Error(`No se encontró el link del RUT ${rutemisor}`);

    await new Promise(r => setTimeout(r, 5000)); // Pause final
    
    console.log("✅ Proceso completado exitosamente.");
    res.json({ 
        success: true, 
        finalUrl: page.url() 
    });

    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ Error Estilo Dusk: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
