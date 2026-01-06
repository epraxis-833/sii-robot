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
    console.log(`🚀 Iniciando navegación para: ${rutemisor}`);
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 1024 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // --- 1. LOGIN ---
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 4000));
    await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 50 });
    await page.type('input[type="password"]', password, { delay: 50 });
    
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);

    // --- FUNCIÓN DE LIMPIEZA CONSTANTE ---
    const clearPopups = async () => {
        await page.evaluate(() => {
            // Cerramos cualquier cosa que diga "Cerrar" o tenga una "X"
            const buttons = Array.from(document.querySelectorAll('button, a, span, .close'));
            const close = buttons.find(b => b.innerText.toLowerCase().includes('cerrar') || b.innerText === 'x');
            if (close) close.click();
            // Removemos capas grises que bloquean el click
            document.querySelectorAll('.modal-backdrop, .modal, #myModal').forEach(m => m.remove());
            document.body.classList.remove('modal-open');
        }).catch(() => {});
    };

    // --- FUNCIÓN DE CLICK INTELIGENTE ---
    const smartClick = async (text, fallbackUrl = null) => {
        await clearPopups();
        console.log(`🔎 Buscando: ${text}`);
        
        const success = await page.evaluate((t) => {
            const elements = Array.from(document.querySelectorAll('a, button, span, li, h4'));
            const target = elements.find(el => el.innerText.replace(/\s+/g, ' ').trim().includes(t));
            if (target) {
                target.scrollIntoView();
                target.click();
                return true;
            }
            return false;
        }, text);

        if (success) {
            await new Promise(r => setTimeout(r, 3500));
            return true;
        } else if (fallbackUrl) {
            console.log(`⚠️ No se halló "${text}", usando atajo URL...`);
            await page.goto(fallbackUrl, { waitUntil: 'networkidle2' });
            return true;
        }
        return false;
    };

    // --- 2. NAVEGACIÓN (Usando tus capturas de consola como guía) ---
    
    await smartClick('Continuar'); // Si no está, no pasa nada
    
    // Si falla el menú "Servicios online", saltamos directo a la sección
    await smartClick('Servicios online', 'https://www.sii.cl/servicios_online/');

    await smartClick('Boletas de honorarios electrónicas');
    await smartClick('Emisor de boleta de honorarios');
    await smartClick('Emitir boleta de honorarios electrónica');
    
    // Aquí usamos la URL directa del paso final si el link falla
    await smartClick('Por usuario autorizado con datos usados anteriormente', 'https://www4.sii.cl/bhfeemisorui/index.html#/emision/usuario-autorizado');

    // --- 3. SELECCIÓN DEL RUT (Basado en tu Imagen 3) ---
    const rutLimpio = rutemisor.replace(/\D/g, '');
    const rutConGuion = rutLimpio.replace(/^(\d+)(\d)$/, '$1-$2');
    
    console.log(`🎯 Buscando emisor: ${rutConGuion}`);
    await new Promise(r => setTimeout(r, 6000)); // Espera extra para la tabla
    await clearPopups();

    const rutSeleccionado = await page.evaluate((exacto, numerico) => {
        // Buscamos en todos los links de la tabla
        const links = Array.from(document.querySelectorAll('table a, .table a, a'));
        const match = links.find(a => {
            const txt = a.innerText.trim();
            const nums = txt.replace(/\D/g, '');
            return txt === exacto || (nums === numerico && nums.length > 0);
        });

        if (match) {
            match.click();
            return true;
        }
        return false;
    }, rutConGuion, rutLimpio);

    if (!rutSeleccionado) {
        throw new Error(`RUT ${rutConGuion} no hallado en la tabla final.`);
    }

    // --- 4. VERIFICACIÓN FINAL ---
    await new Promise(r => setTimeout(r, 5000));
    const urlFinal = page.url();
    
    console.log("✅ Navegación completada con éxito.");
    res.json({ success: true, finalUrl: urlFinal });

    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ ERROR: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0');
