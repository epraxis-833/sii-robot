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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // 1. LOGIN (Con tus pausas exactas de PHP)
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

    // FUNCIÓN SUPER-DUSK: Intenta clic, si no, busca ruta alterna
    const superClick = async (text, isOptional = false) => {
        console.log(`🖱️ Buscando: ${text}`);
        
        // Limpiar avisos y capas oscuras (Video 0:34)
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a, span'));
            const close = btns.find(b => b.innerText.toLowerCase().includes('cerrar') || b.innerText === 'x');
            if (close) close.click();
            document.querySelectorAll('.modal-backdrop, .modal').forEach(m => m.remove());
        }).catch(() => {});

        const clicked = await page.evaluate((t) => {
            const items = Array.from(document.querySelectorAll('a, button, span, li, h4'));
            const target = items.find(el => el.innerText.trim().includes(t));
            if (target) {
                target.scrollIntoView();
                target.click();
                return true;
            }
            return false;
        }, text);

        if (clicked) {
            await new Promise(r => setTimeout(r, 3000)); // Pause(3000)
            return true;
        } else if (!isOptional) {
            console.log(`⚠️ No se halló "${text}", intentando refrescar...`);
            return false;
        }
    };

    // 2. NAVEGACIÓN (Siguiendo tu video y código Dusk)
    
    await superClick('Continuar', true); 

    // SI "Servicios online" falla por el menú, navegamos directo a la sección
    const menuOk = await superClick('Servicios online', true);
    if (!menuOk) {
        console.log("🚀 Salto directo a sección Servicios Online");
        await page.goto('https://www.sii.cl/servicios_online/', { waitUntil: 'networkidle2' });
    }

    await superClick('Boletas de honorarios electrónicas');
    await superClick('Emisor de boleta de honorarios');
    await superClick('Emitir boleta de honorarios electrónica');
    
    // Paso final de tu Dusk
    await superClick('Por usuario autorizado con datos usados anteriormente');

    // 3. SELECCIÓN DEL RUT EMISOR (Carga de tabla)
    console.log(`🎯 Buscando RUT: ${rutemisor}`);
    await new Promise(r => setTimeout(r, 6000));

    const rutFound = await page.evaluate((target) => {
        const cleanTarget = target.replace(/\D/g, ''); 
        const links = Array.from(document.querySelectorAll('a'));
        const match = links.find(l => l.innerText.replace(/\D/g, '') === cleanTarget);
        if (match) {
            match.click();
            return true;
        }
        return false;
    }, rutemisor);

    if (!rutFound) {
        throw new Error(`RUT ${rutemisor} no hallado. La tabla no cargó o el RUT no está en la lista.`);
    }

    await new Promise(r => setTimeout(r, 5000)); // Pause(5000) final
    
    console.log("✅ Proceso exitoso.");
    res.json({ success: true, finalUrl: page.url() });
    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ FALLO: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
