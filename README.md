# TrunksTV

Reproductor personalizado de Twitch con multistream, inicio de sesión con cuenta de Twitch, fuentes adicionales (HLS / webs externas) y una interfaz tipo cine pensada para ver directos sin distracciones.

**Demo en vivo:** <https://trunks500500500.github.io/watchtv-twitch/>

---

## Tabla de contenidos

- [Características](#características)
- [Cómo usarlo](#cómo-usarlo)
- [Atajos de teclado](#atajos-de-teclado)
- [Inicio de sesión con Twitch](#inicio-de-sesión-con-twitch)
- [Fuentes soportadas](#fuentes-soportadas)
- [Ejecución local](#ejecución-local)
- [Despliegue en GitHub Pages](#despliegue-en-github-pages)
- [Configuración de OAuth para tu propio fork](#configuración-de-oauth-para-tu-propio-fork)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Stack técnico](#stack-técnico)
- [Créditos](#créditos)

---

## Características

### Reproductor principal
- Reproductor Twitch embebido con controles personalizados (play, mute, volumen, calidad, fullscreen).
- Barra de información superior con avatar, título del stream, categoría, uptime, contador de viewers y badge LIVE/OFFLINE.
- **Modo cine** (tecla `T`): oculta el chat para ver el stream en ancho completo.
- **Mini player** arrastrable y redimensionable (tecla `P`) para seguir viendo mientras navegas por otras partes.
- **Chat de Twitch** integrado como panel lateral, ocultable con un clic o con la tecla `C`.

### Landing page
- Al entrar a la aplicación aparece una pequeña pantalla de bienvenida con dos opciones: **iniciar sesión con Twitch** o **continuar como invitado**.
- La elección de "invitado" se recuerda durante la sesión del navegador.

### Inicio de sesión con Twitch (OAuth Implicit Flow)
- Login directo con tu cuenta de Twitch — sin contraseñas ni backend.
- Una vez conectado, la lista de **Favoritos se sustituye automáticamente por los canales que sigues en Twitch** (hasta 2.000 canales).
- Botón para **actualizar la lista de seguidos** y para **cerrar sesión** (con revocación del token) desde el menú de ajustes.
- Indicador "Conectado: @usuario" con el número de canales seguidos.

### Multistream (hasta 4 streams simultáneos)
- Cuadrícula 2×2 o layout **1 principal + 3 laterales** (tecla `L`).
- **Controles por slot**: cada uno de los 4 streams tiene su propio botón de play/pause, mute y deslizador de volumen; aparecen al pasar el ratón por encima.
- El slot **activo** suena a volumen completo; el resto se silencia automáticamente — útil para seguir visualmente varios streams sin cacofonía.
- Botón para **promover un slot a reproductor principal** (flecha de salida).
- Botón para **vaciar todos los slots** de un solo clic.
- Pestañas de chat por canal cuando el multistream está activo.

### Buscador de canales inteligente
- Dropdown con favoritos / seguidos en Twitch, últimos vistos y búsqueda libre.
- **Filtros y ordenación**:
  - **En vivo** (en directo primero, ordenados por viewers)
  - **Viewers** (de más a menos espectadores)
  - **A–Z** (alfabético)
  - Toggle **"Solo en vivo"** para ocultar canales offline
- **Badge de viewers** al lado de cada canal en directo (`1.2K`, `45.3K`, `1.1M`…).
- **Avatares** cargados automáticamente desde Twitch.
- **Indicador LIVE** en cada canal en directo.

### Notificaciones de escritorio
- Activables desde el menú de ajustes: te avisa cuando un favorito (o seguido en Twitch) entra en directo.
- El poll de estado en vivo se hace cada 2 minutos usando la API Helix de Twitch cuando hay sesión, o `decapi.me` como fallback para invitados.

### Personalización
- **6 colores de acento** (Violeta, Rosa, Cyan, Verde, Naranja, Rojo).
- **Selector de calidad** de video (Auto / 1080p / 720p / 480p / 360p / 160p — cuando la fuente lo permite).
- Todas las preferencias se guardan en `localStorage`.
- Botón **"Restablecer preferencias"** para empezar de cero.

### Compartir y accesos rápidos
- Tecla `S` copia al portapapeles el enlace del canal actual (Twitch, iluenp o URL genérica).
- Opción **"Abrir en Twitch.tv"** desde el menú de ajustes.
- Enlaces Twitch completos (`https://www.twitch.tv/ibai`) son aceptados por el buscador y convertidos automáticamente al canal.

### Fuentes adicionales (OvenPlayer + iframe)
Además de Twitch, el reproductor soporta:
- **iluenp / ilutvlive**: Stream HLS de IluTvlive viendo anime, con autodetección de online/offline y mensaje amigable cuando no está transmitiendo.
- **Shonen Semanal** (`watch.shonensemanal.site`): embebido como iframe para ver las emisiones semanales.
- **URLs HLS / DASH / WebRTC** genéricas con el prefijo `oven:https://...`.
- **URLs iframe** genéricas con el prefijo `iframe:https://...`.

---

## Cómo usarlo

1. Abre la app → verás la landing page.
2. **Inicia sesión con Twitch** para que tu lista de seguidos aparezca como favoritos, o **continúa como invitado** con los 6 canales por defecto.
3. Haz clic en la barra superior o presiona `1`–`9` para saltar entre favoritos.
4. Activa el multistream con la tecla `G` y añade hasta 4 canales.
5. Pon el cursor sobre cualquier slot del multistream para ver sus controles individuales.

---

## Atajos de teclado

| Tecla | Acción |
|:---:|:---|
| `Espacio` | Play / Pausa |
| `M` | Silenciar / activar sonido |
| `F` | Pantalla completa |
| `T` | Modo cine |
| `P` | Mini player |
| `G` | Activar / salir de multistream |
| `L` | Alternar layout del multistream |
| `S` | Copiar enlace del canal |
| `↑` / `↓` | Volumen ±10% |
| `1`–`9` | Saltar a favorito 1–9 |
| `Esc` | Cerrar menús |
| `?` | Mostrar panel de ayuda |

---

## Inicio de sesión con Twitch

El login usa **OAuth 2.0 Implicit Flow** — es un flujo totalmente del lado del cliente:

1. El botón "Iniciar sesión con Twitch" te redirige a `id.twitch.tv`.
2. Autorizas la app (solo se pide el scope `user:read:follows`).
3. Twitch te redirige de vuelta con un token en el fragmento de la URL.
4. El token se guarda localmente en `localStorage` y se usa para llamar a la Helix API.
5. Para cerrar sesión, el token se revoca contra `id.twitch.tv/oauth2/revoke`.

**Importante**: el Client-ID es público por diseño; el Client-Secret **nunca** se usa aquí (por eso no se necesita backend).

---

## Fuentes soportadas

Escribe cualquiera de estos formatos en el buscador:

| Formato | Ejemplo | Fuente |
|:---|:---|:---|
| `canal` | `ibai` | Twitch |
| URL de Twitch | `https://twitch.tv/ibai` | Twitch |
| `iluenp` / `ilutvlive` | `iluenp` | IluTvlive (HLS) |
| URL de iluenp | `https://watch.iluenp.com/` | IluTvlive (HLS) |
| `shonen` / `shonensemanal` | `shonen` | Shonen Semanal (iframe) |
| URL de Shonen | `https://watch.shonensemanal.site/` | Shonen Semanal (iframe) |
| `oven:<URL>` | `oven:https://.../stream.m3u8` | HLS / DASH / WebRTC genérico |
| `iframe:<URL>` | `iframe:https://ejemplo.com/` | Web externa embebida |

---

## Ejecución local

Requiere Node.js ≥ 14. No hay dependencias obligatorias (el `package.json` incluye `axios` pero el servidor no lo usa).

```bash
git clone https://github.com/trunks500500500/watchtv-twitch.git
cd watchtv-twitch
npm start
```

Abre <http://localhost:3000>.

Variables de entorno soportadas:
- `PORT` — puerto (por defecto `3000`)
- `HOST` — host (por defecto `0.0.0.0`)

> **Nota**: puedes abrir `reproductorTwitch.html` directamente con Live Server si solo quieres probar sin OAuth. Para que el login con Twitch funcione, la URL **exacta** debe estar registrada como redirect URI en la consola de desarrollador de Twitch.

---

## Despliegue en GitHub Pages

El proyecto está pensado para desplegarse en GitHub Pages:

1. Sube el repositorio a GitHub.
2. Activa Pages en **Settings → Pages → main branch**.
3. La URL será `https://<usuario>.github.io/<repo>/`.
4. Registra esa URL **exacta** como redirect URI en tu app de Twitch (ver sección siguiente).

El `server.js` solo se usa para desarrollo local — GitHub Pages sirve los archivos estáticos directamente.

---

## Configuración de OAuth para tu propio fork

Si quieres hostear tu propia instancia con tu propio Client-ID de Twitch:

1. Ve a <https://dev.twitch.tv/console/apps/create>.
2. Crea una app nueva:
   - **OAuth Redirect URLs**: añade **todas** las URLs donde vas a ejecutar la app. Por ejemplo:
     - `http://localhost:3000/`
     - `http://localhost:3000/reproductorTwitch.html`
     - `https://tuusuario.github.io/tu-repo/`
   - **Category**: Website Integration
   - **Client Type**: Public o Confidential — ambos funcionan con Implicit Flow
3. Copia el **Client ID** generado.
4. Abre [`assets/app.js`](assets/app.js) y cambia la constante:
   ```js
   const TWITCH_CLIENT_ID = 'tu_client_id_aqui';
   ```
5. Despliega y listo.

> El `redirect_uri` que se envía a Twitch se calcula en tiempo de ejecución como `window.location.origin + window.location.pathname`, así que debe coincidir **exactamente** con una de las URLs registradas.

---

## Estructura del proyecto

```
.
├── reproductorTwitch.html        # Página principal
├── reproductorMultiplataforma.html  # Reproductor alternativo (sin login)
├── assets/
│   ├── styles.css                # Todos los estilos
│   └── app.js                    # Toda la lógica
├── server.js                     # Servidor estático para desarrollo local
├── package.json
└── README.md
```

---

## Stack técnico

- **HTML / CSS / JavaScript vanilla** — sin framework, sin build step.
- **Twitch Embed SDK** (`player.twitch.tv/js/embed/v1.js`) para streams de Twitch.
- **OvenPlayer** + **hls.js** para streams HLS (iluenp).
- **FingerprintJS** para autenticación contra la API de iluenp.
- **API Helix de Twitch** (`/users`, `/channels/followed`, `/streams`) para login y estado en vivo.
- **decapi.me** como fallback sin autenticación para metadatos e información de uptime/viewers.
- **localStorage** para persistencia de preferencias y estado.
- **Node.js** (servidor estático de ~70 líneas, sin dependencias) solo para desarrollo.

---

## Créditos

Proyecto personal desarrollado por [@trunks500500500](https://github.com/trunks500500500).

- Twitch es una marca registrada de Twitch Interactive, Inc. Este proyecto no está afiliado ni respaldado por Twitch.
- OvenPlayer: <https://github.com/AirenSoft/OvenPlayer>
- hls.js: <https://github.com/video-dev/hls.js>
- FingerprintJS: <https://github.com/fingerprintjs/fingerprintjs>

---

**¿Bug o sugerencia?** Abre un issue: <https://github.com/trunks500500500/watchtv-twitch/issues>
