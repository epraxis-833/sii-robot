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
    console.log(`🚀 Iniciando navegación orgánica para: ${rutemisor}`);
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });
    
    const page = await browser.newPage();
    // User agent de un navegador real para evitar el retorno al login
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    // --- 1. LOGIN REFORZADO ---
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2500));
    
    await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 100 });
    await page.type('input[type="password"]', password, { delay: 100 });
    
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    console.log("✅ Sesión iniciada");

    // --- FUNCIÓN DE CLICK HUMANO (Sin atajos que rompan la sesión) ---
    const clickHumano = async (texto, obligatorio = true) => {
        console.log(`🔎 Buscando: "${texto}"`);
        
        // Espera un poco antes de cada click para no saturar al SII
        await new Promise(r => setTimeout(r, 2000));

        const success = await page.evaluate((t) => {
            const elements = Array.from(document.querySelectorAll('a, button, span, h4, li'));
            const target = elements.find(el => el.innerText.replace(/\s+/g, ' ').trim().includes(t));
            if (target) {
                target.scrollIntoView();
                target.click();
                return true;
            }
            return false;
        }, texto);

        if (success) {
            console.log(`✔️ Click en: ${texto}`);
            await new Promise(r => setTimeout(r, 3000));
            return true;
        } else if (obligatorio) {
            // Si no lo encuentra, tomamos captura del texto para el log
            const txt = await page.evaluate(() => document.body.innerText.slice(0, 100));
            throw new Error(`No se encontró "${texto}". Texto en pantalla: ${txt}`);
        }
        return false;
    };

    // --- 2. NAVEGACIÓN PASO A PASO (Según tus imágenes de consola) ---
    
    await clickHumano('Continuar', false); // Cierra avisos si aparecen
    
    // IMPORTANTE: Navegamos por clics, NO por URL directa para que no nos bote
    await clickHumano('Servicios online');
    await clickHumano('Boletas de honorarios electrónicas');
    await clickHumano('Emisor de boleta de honorarios');
    await clickHumano('Emitir boleta de honorarios electrónica');
    
    // Este es el paso crítico de tu Imagen 2
    await clickHumano('Por usuario autorizado con datos usados anteriormente');

    // --- 3. SELECCIÓN DEL RUT EN LA TABLA (Imagen 3) ---
    const rutBuscado = rutemisor.includes('-') ? rutemisor : rutemisor.replace(/^(\d+)(\d)$/, '$1-$2');
    console.log(`🎯 Buscando emisor en tabla: ${rutBuscado}`);
    
    // Esperamos a que la tabla cargue (es lenta)
    await new Promise(r => setTimeout(r, 8000));

    let encontrado = false;
    // Buscamos en la página y en IFRAMES (la tabla antigua suele estar en marcos)
    const frames = [page, ...page.frames()];
    
    for (const frame of frames) {
        encontrado = await frame.evaluate((target) => {
            const links = Array.from(document.querySelectorAll('table a, a'));
            const match = links.find(a => a.innerText.trim().replace(/\./g, '') === target.replace(/\./g, ''));
            if (match) {
                match.click();
                return true;
            }
            return false;
        }, rutBuscado).catch(() => false);
        
        if (encontrado) break;
    }

    if (!encontrado) {
        const screenshot = await page.screenshot({ encoding: 'base64' });
        throw new Error(`El RUT ${rutBuscado} no está en la tabla. Verifica si el usuario tiene permiso.`);
    }

    // --- 4. ESPERA FINAL ---
    await new Promise(r => setTimeout(r, 5000));
    const urlFinal = page.url();
    
    console.log(`✅ ¡Llegamos! URL final: ${urlFinal}`);
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
