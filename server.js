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
    console.log(`🚀 Iniciando proceso para emisor: ${rutemisor}`);
    
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
    await page.setViewport({ width: 1366, height: 1024 });
    // User Agent actualizado para evitar detecciones
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // --- 1. LOGIN (Con pausas estilo Dusk PHP) ---
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 5000));

    await page.type('input[name*="rutcntr"]', rutautorizado, { delay: 60 });
    await new Promise(r => setTimeout(r, 1500));
    await page.type('input[type="password"]', password, { delay: 60 });
    await new Promise(r => setTimeout(r, 1500));
    
    await Promise.all([
        page.click('#bt_ingresar'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
    ]);
    await new Promise(r => setTimeout(r, 5000));

    // --- FUNCIÓN HELPER: clickLink (Basada en tus capturas de consola) ---
    const clickLink = async (text, isOptional = false) => {
        console.log(`🔎 Buscando link: "${text}"`);
        
        // Limpiar obstáculos (Avisos de impuestos, modales, capas oscuras)
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a, span'));
            const close = btns.find(b => b.innerText.toLowerCase().includes('cerrar') || b.innerText === 'x');
            if (close) close.click();
            document.querySelectorAll('.modal-backdrop, .modal, #myModal').forEach(m => m.remove());
            document.body.classList.remove('modal-open');
        }).catch(() => {});

        const success = await page.evaluate((t) => {
            // Buscamos enlaces (a) o botones que contengan el texto
            const elements = Array.from(document.querySelectorAll('a, button, li, span, h4'));
            
            // Normalizamos el texto: quitamos espacios extras y saltos de línea (Imagen 2)
            const target = elements.find(el => {
                const cleanText = el.innerText.replace(/\s+/g, ' ').trim();
                return cleanText.includes(t);
            });

            if (target) {
                target.scrollIntoView();
                target.click();
                return true;
            }
            return false;
        }, text);

        if (success) {
            console.log(`✅ Click en: ${text}`);
            await new Promise(r => setTimeout(r, 3500)); // Pausa de navegación
            return true;
        } else if (!isOptional) {
            throw new Error(`No se pudo encontrar el link: ${text}`);
        }
        return false;
    };

    // --- 2. NAVEGACIÓN (Basada en tus Imágenes 1 y 2) ---
    
    await clickLink('Continuar', true); 

    // Intentamos ir a servicios online, si falla el menú, forzamos URL
    const enServicios = await clickLink('Servicios online', true);
    if (!enServicios) {
        console.log("🚀 Forzando navegación directa a Servicios Online");
        await page.goto('https://www.sii.cl/servicios_online/', { waitUntil: 'networkidle2' });
    }

    await clickLink('Boletas de honorarios electrónicas'); // Imagen 1
    await clickLink('Emisor de boleta de honorarios');      // Imagen 1
    await clickLink('Emitir boleta de honorarios electrónica'); // Imagen 1 (Submenú)
    
    // Texto largo de tu Imagen 2
    await clickLink('Por usuario autorizado con datos usados anteriormente');

    // --- 3. SELECCIÓN DEL RUT (Basada en tu Imagen 3) ---
    
    // Formateamos el RUT para que coincida con la tabla (196705686 -> 19670568-6)
    const rutLimpio = rutemisor.replace(/\D/g, '');
    const rutConGuion = rutLimpio.replace(/^(\d+)(\d)$/, '$1-$2');
    
    console.log(`🎯 Buscando en tabla el RUT: ${rutConGuion}`);
    
    let rutSeleccionado = false;
    for (let i = 0; i < 15; i++) { // Reintento de 15 segundos para que cargue la tabla
        rutSeleccionado = await page.evaluate((exacto, numerico) => {
            // Buscamos específicamente links dentro de la tabla (Imagen 3)
            const tableLinks = Array.from(document.querySelectorAll('table a, .table a, a'));
            
            const match = tableLinks.find(a => {
                const textoLink = a.innerText.trim();
                const soloNumeros = textoLink.replace(/\D/g, '');
                // Comparamos contra el formato con guion O contra los números puros
                return textoLink === exacto || (soloNumeros === numerico && soloNumeros.length > 0);
            });

            if (match) {
                match.click();
                return true;
            }
            return false;
        }, rutConGuion, rutLimpio);

        if (rutSeleccionado) break;
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!rutSeleccionado) {
        // Diagnóstico para el log si falla
        const queHay = await page.evaluate(() => 
            Array.from(document.querySelectorAll('table a')).map(a => a.innerText.trim()).slice(0, 5)
        );
        throw new Error(`RUT ${rutConGuion} no hallado. En tabla se ve: [${queHay.join(', ')}]`);
    }

    // --- 4. FINALIZACIÓN ---
    await new Promise(r => setTimeout(r, 5000)); // Espera final para carga de formulario
    
    console.log("✅ Proceso completado: Emisor seleccionado.");
    
    res.json({ 
        success: true, 
        finalUrl: page.url() 
    });

    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ ERROR: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🤖 Servidor Railway escuchando en puerto ${PORT}`);
});
