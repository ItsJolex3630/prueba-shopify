# 🛒 Shopify Headless Storefront & Universal Cart (Sandbox)

Prototipo de e-commerce **Headless** conectado a **Shopify** mediante la **Storefront API (GraphQL)**.

Permite que cualquier diseño o aplicación web externa (desarrollada en HTML/JS, Astro, React, etc.) tenga catálogo dinámico sincronizado y procese pagos a través del **Checkout seguro de Shopify**, configurado y optimizado para **Venezuela**.

---

## 🚀 Características

- **Catálogo en Tiempo Real:** Los productos se consultan directamente de la tienda Shopify vía GraphQL (`Storefront API`).
- **Carrito Deslizable Universal:** Añade, incrementa, reduce o elimina productos sin recargar la página.
- **Checkout Oficial de Shopify:** Genera una sesión de pago real (`cartCreate`) y redirige al flujo cifrado de Shopify.
- **Configurado para Venezuela:** Mercado de Venezuela activo con selección de estados (Distrito Capital, Miranda, Zulia, etc.) y tarifa de entrega nacional.
- **Pasarela de Prueba Gratuita ($0):** Configurado con *Bogus Gateway* en tienda de desarrollo de Shopify Partners.
- **Botón Alternativo WhatsApp:** Opción directa para pedidos con Pago Móvil o Zelle.

---

## 📱 Datos para Pruebas (Mobile y Desktop)

Si visitas la tienda o el checkout desde un navegador nuevo o teléfono móvil:
- **Clave de Acceso a Tienda de Prueba:** `tewvay` *(Shopify la solicita por ser tienda en modo desarrollo)*
- **Tarjeta de Prueba (Bogus Gateway):**
  - **Número:** `1`
  - **Nombre:** Cualquier nombre
  - **CVV:** `123`
  - **Fecha de expiración:** Cualquier fecha futura (ej. `12/28`)
- **País de Envío:** Selecciona `Venezuela` en el desplegable de Entrega.

---

## 🛠️ Estructura del Proyecto

```text
├── index.html          # Interfaz web responsiva (Tailwind CSS)
├── cart-engine.js      # Motor universal del carrito y conexión GraphQL
├── store.config.js     # Configuración de credenciales y dominio de la tienda
└── README.md           # Documentación
```

---

## 🔄 Cómo Conectar un Nuevo Cliente

Para conectar este mismo sistema a la tienda de cualquier cliente:
1. En Shopify Admin del cliente: `Configuración > Apps > Desarrollar apps > Crear una app`.
2. Activar permisos de **Storefront API**:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_write_checkouts` y `unauthenticated_read_checkouts`
3. Copiar el **Storefront Access Token** y actualizar `store.config.js`:
   ```javascript
   export const STORE_CONFIG = {
     shopDomain: "tienda-cliente.myshopify.com",
     storefrontToken: "token_del_cliente",
     // ...
   };
   ```
