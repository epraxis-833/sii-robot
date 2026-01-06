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

    // 1. LOGIN
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 50 });
    await page.type('input[type="password"]', password, { delay: 50 });
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // FUNCIÓN PARA CERRAR AVISOS (Segundo 0:34 del video)
    const clearModals = async () => {
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a, span, .close, .modal-footer button'));
            const closeBtn = buttons.find(b => {
                const t = b.innerText.toLowerCase();
                return t.includes('cerrar') || t.includes('aceptar') || t === 'x';
            });
            if (closeBtn) closeBtn.click();
        }).catch(() => {});
        await new Promise(r => setTimeout(r, 1000));
    };

    // FUNCIÓN PARA CLIC EN MENÚS (Segundo 0:38 del video)
    const clickMenu = async (text) => {
        console.log(`🖱️ Intentando clic en: ${text}`);
        await clearModals(); // Limpiar avisos antes de cada paso
        
        const success = await page.evaluate((t) => {
            // Buscamos específicamente en elementos que el SII usa para sus menús
            const elements = Array.from(document.querySelectorAll('a, li, span, b, h4'));
            const target = elements.find(el => el.innerText.trim().includes(t));
            if (target) {
                target.scrollIntoView();
                target.click();
                return true;
            }
            return false;
        }, text);

        if (!success) throw new Error(`No se pudo encontrar o desplegar: ${text}`);
        // Espera de 2 segundos para que el acordeón/despliegue termine (como se ve en el video)
        await new Promise(r => setTimeout(r, 2000)); 
    };

    // 2. NAVEGACIÓN PASO A PASO
    await page.goto('https://www.sii.cl/servicios_online/', { waitUntil: 'networkidle2' });
    
    await clickMenu("Boletas de honorarios");
    await clickMenu("Emisor de boleta");
    await clickMenu("Emitir boleta de honorarios");
    
    // El paso final suele ser un enlace directo que sí cambia la URL
    console.log("🖱️ Clic en: Por usuario autorizado");
    await Promise.all([
        page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('a')).find(a => a.innerText.includes("Por usuario autorizado"));
            if (el) el.click();
        }),
        page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
    ]);

    // 3. SELECCIÓN EN TABLA (Segundo 0:47 del video)
    console.log(`🎯 Buscando RUT emisor: ${rutemisor}`);
    await new Promise(r => setTimeout(r, 4000));

    const tableSelection = await page.evaluate((target) => {
        const targetClean = target.replace(/\D/g, ''); // 196705686
        const links = Array.from(document.querySelectorAll('table a'));
        
        const found = links.find(a => {
            const linkClean = a.innerText.replace(/\D/g, '');
            return linkClean === targetClean && linkClean.length > 0;
        });

        if (found) {
            found.click();
            return { success: true };
        }
        return { 
            success: false, 
            debug: `Tabla: ${!!document.querySelector('table')}. Texto: ${document.body.innerText.substring(0, 200)}` 
        };
    }, rutemisor);

    if (!tableSelection.success) {
        throw new Error(`Fallo en tabla: ${tableSelection.debug}`);
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    const finalUrl = page.url();
    
    await browser.close();
    res.json({ success: true, finalUrl });

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ Error en robot: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Robot listo en puerto ${PORT}`));
