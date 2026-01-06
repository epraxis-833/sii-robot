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
    console.log(`🚀 Iniciando proceso para Emisor: ${rutemisor}`);
    
    browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 1024 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // --- 1. LOGIN (Réplica de tus pausas de Dusk) ---
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

    // --- FUNCIÓN HELPER: duskClick (Simula Dusk clickLink) ---
    const duskClick = async (text, isOptional = false) => {
        console.log(`🖱️ Intentando clickLink: ${text}`);
        
        // Limpiar obstáculos (Modales, backdrops oscuros)
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a, span'));
            const close = btns.find(b => b.innerText.toLowerCase().includes('cerrar') || b.innerText === 'x');
            if (close) close.click();
            document.querySelectorAll('.modal-backdrop, .modal, #myModal').forEach(m => m.remove());
            document.body.classList.remove('modal-open');
        }).catch(() => {});

        const result = await page.evaluate((t) => {
            const elements = Array.from(document.querySelectorAll('a, button, span, li, h4, b'));
            const target = elements.find(el => el.innerText.trim().includes(t));
            if (target) {
                target.scrollIntoView();
                target.click();
                return true;
            }
            return false;
        }, text);

        if (result) {
            await new Promise(r => setTimeout(r, 3000));
            return true;
        } else if (!isOptional) {
            console.log(`⚠️ No se encontró "${text}", reintentando con salto directo...`);
            return false;
        }
        return false;
    };

    // --- 2. NAVEGACIÓN PASO A PASO (Estilo Dusk PHP) ---
    await duskClick('Continuar', true); 

    const servOnline = await duskClick('Servicios online', true);
    if (!servOnline) {
        // SALTO DE EMERGENCIA: Si el menú falla en Railway, vamos directo
        await page.goto('https://www.sii.cl/servicios_online/', { waitUntil: 'networkidle2' });
    }

    await duskClick('Boletas de honorarios electrónicas');
    await duskClick('Emisor de boleta de honorarios');
    await duskClick('Emitir boleta de honorarios electrónica');
    await duskClick('Por usuario autorizado con datos usados anteriormente');

    // --- 3. SELECCIÓN DEL RUT (Corrección de formato y espera de tabla) ---
    
    // Formateamos para la tabla: 196705686 -> 19670568-6
    const rutNumeros = rutemisor.replace(/\D/g, '');
    const rutConGuion = rutNumeros.replace(/^(\d+)(\d)$/, '$1-$2');
    
    console.log(`🎯 Buscando en tabla: ${rutConGuion} o ${rutNumeros}`);
    
    let rutFound = false;
    for (let i = 0; i < 15; i++) { // Reintento de 15 segundos
        rutFound = await page.evaluate((exact, raw) => {
            const links = Array.from(document.querySelectorAll('table a, a'));
            const match = links.find(l => {
                const text = l.innerText.trim();
                const textNumbers = text.replace(/\D/g, '');
                return text === exact || textNumbers === raw;
            });

            if (match) {
                match.scrollIntoView();
                match.click();
                return true;
            }
            return false;
        }, rutConGuion, rutNumeros);

        if (rutFound) break;
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!rutFound) {
        // Diagnóstico: Obtenemos los links que sí encontró para ver el formato real
        const linksVisibles = await page.evaluate(() => 
            Array.from(document.querySelectorAll('table a')).map(a => a.innerText.trim()).slice(0, 5)
        );
        throw new Error(`RUT no hallado. Links vistos: [${linksVisibles.join(', ')}]`);
    }

    // --- 4. CIERRE Y RESPUESTA ---
    await new Promise(r => setTimeout(r, 5000)); // Pause final
    console.log("✅ Navegación y selección completada.");
    
    res.json({ 
        success: true, 
        finalUrl: page.url() 
    });

    await browser.close();

  } catch (error) {
    if (browser) await browser.close();
    console.error(`❌ ERROR CRÍTICO: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Robot Railway escuchando en puerto ${PORT}`));
