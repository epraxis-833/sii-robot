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

    // 1. LOGIN (Con tus pausas de Dusk)
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

    // FUNCIÓN REPLICADA DE Dusk ->clickLink() pero OPCIONAL
    const duskClick = async (text, isOptional = false) => {
        console.log(`🖱️ Intentando clickLink: ${text}`);
        
        // Limpieza de avisos (como el del 14.5% o el de Chrome)
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a, span'));
            const close = buttons.find(b => b.innerText.toLowerCase().includes('cerrar') || b.innerText === 'x');
            if (close) close.click();
            // Quitar capas oscuras que bloquean
            document.querySelectorAll('.modal-backdrop').forEach(mb => mb.remove());
        }).catch(() => {});

        const clicked = await page.evaluate((t) => {
            const elements = Array.from(document.querySelectorAll('a, button, span, li, h4'));
            const target = elements.find(el => el.innerText.trim().includes(t));
            if (target) {
                target.scrollIntoView();
                target.click();
                return true;
            }
            return false;
        }, text);

        if (clicked) {
            console.log(`✅ Éxito en: ${text}`);
            await new Promise(r => setTimeout(r, 3000)); // Pause(3000)
            return true;
        } else if (!isOptional) {
            throw new Error(`Dusk falló: No se encontró "${text}"`);
        }
        console.log(`⚠️ No se encontró "${text}", pero es opcional. Continuando...`);
        return false;
    };

    // 2. NAVEGACIÓN (Siguiendo tu lógica PHP punto por punto)
    
    // El botón "Continuar" a veces no sale, por eso lo ponemos como opcional (true)
    await duskClick('Continuar', true); 
    
    await duskClick('Servicios online');
    await duskClick('Boletas de honorarios electrónicas');
    await duskClick('Emisor de boleta de honorarios');
    await duskClick('Emitir boleta de honorarios electrónica');
    
    // Este es el paso clave de tu código local
    await duskClick('Por usuario autorizado con datos usados anteriormente');

    // 3. SELECCIÓN DEL RUT EMISOR (Carga lenta 5000ms)
    console.log(`🎯 Buscando emisor: ${rutemisor}`);
    await new Promise(r => setTimeout(r, 5000));

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
        // Reporte de error con lo que hay en pantalla
        const screenText = await page.evaluate(() => document.body.innerText.substring(0, 300));
        throw new Error(`No se encontró el RUT ${rutemisor}. Texto en pantalla: ${screenText}`);
    }

    await new Promise(r => setTimeout(r, 5000));
    
    console.log("✅ Navegación completada.");
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
