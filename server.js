const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({limit: '10mb'}));

app.post('/sii-navigate', async (req, res) => {
  const { rutautorizado, password, rutemisor } = req.body;
  console.log(`📥 Procesando solicitud para RUT Autorizado: ${rutautorizado}`);
  
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
    // Definimos un viewport amplio para asegurar que la tabla sea visible
    await page.setViewport({ width: 1366, height: 1024 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 1. LOGIN
    await page.goto('https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    await page.waitForSelector('input[name*="rutcntr"]', { visible: true });
    await page.type('input[name*="rutcntr"]', rutautorizado);
    await page.type('input[type="password"]', password);
    
    const loginButton = 'button[type="submit"], input[type="submit"], #bt_ingresar';
    await Promise.all([
        page.click(loginButton),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    // FUNCIÓN DE CLICK ROBUSTA (Busca en múltiples etiquetas)
    const clickByText = async (text, isOptional = false) => {
        console.log(`🖱️ Buscando: ${text}`);
        await new Promise(r => setTimeout(r, 2500)); 

        const clicked = await page.evaluate((searchText) => {
            const elements = Array.from(document.querySelectorAll('a, button, span, b, td'));
            const target = elements.find(a => 
                a.innerText.toLowerCase().includes(searchText.toLowerCase())
            );
            if (target) {
                target.click();
                return true;
            }
            return false;
        }, text);

        if (clicked) {
            console.log(`✅ Click exitoso en: ${text}`);
            try {
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 12000 });
            } catch (e) {}
        } else if (!isOptional) {
            throw new Error(`No se encontró el elemento: ${text}`);
        }
    };

    // 2. NAVEGACIÓN PASO A PASO
    await clickByText("Continuar", true); 
    await clickByText("Servicios online");
    await clickByText("Boletas de honorarios");
    await clickByText("Emisor de boleta");
    await clickByText("Emitir boleta de honorarios");
    await clickByText("Por usuario autorizado");
    
    // 3. SELECCIÓN DE RUT EMISOR (Optimizado con espera de tabla)
    console.log(`🔎 Esperando que cargue la tabla de contribuyentes autorizados...`);
    
    // Forzamos la espera de que el texto de la tabla aparezca en pantalla
    try {
        await page.waitForFunction(
            () => document.body.innerText.includes("seleccionar al contribuyente") || 
                  document.querySelector('table') !== null,
            { timeout: 20000 }
        );
    } catch (e) {
        console.log("⚠️ Tiempo de espera agotado para la tabla, intentando buscar igual.");
    }

    console.log(`🎯 Buscando coincidencia numérica para el RUT: ${rutemisor}`);
    
    const result = await page.evaluate((targetRut) => {
        // Normalizamos el RUT buscado (solo números)
        const targetNumbers = targetRut.replace(/\D/g, '');
        
        // Priorizamos buscar dentro de tablas para evitar enlaces del menú lateral
        const links = Array.from(document.querySelectorAll('table a, table td, .sand-p-base a'));
        
        const targetLink = links.find(el => {
            const elNumbers = el.innerText.replace(/\D/g, '');
            return elNumbers === targetNumbers && elNumbers.length > 0;
        });

        if (targetLink) {
            targetLink.click();
            return { success: true };
        }
        
        // Si no lo encuentra, devolvemos lo que hay en la tabla para diagnosticar
        const table = document.querySelector('table');
        return { 
            success: false, 
            debug: table ? table.innerText : "TABLA NO DETECTADA EN DOM"
        };
    }, rutemisor);

    if (!result.success) {
        console.log("📊 Contenido detectado en la tabla:", result.debug);
        throw new Error(`El RUT ${rutemisor} no se encontró. Contenido de tabla: ${result.debug}`);
    }

    // 4. ESPERA FINAL
    console.log("⏳ Esperando transición final al formulario de emisión...");
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {
        console.log("Aviso: La navegación final excedió el tiempo, pero procedemos.");
    });
    
    const finalUrl = page.url();
    await browser.close();
    
    console.log("✅ Proceso completado exitosamente.");
    res.json({ success: true, finalUrl });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error("❌ Error en el proceso:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Robot activo en puerto ${PORT}`);
});
