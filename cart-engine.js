import { STORE_CONFIG } from './store.config.js';

// Estado local del carrito persistido en localStorage por tienda
const CART_STORAGE_KEY = `universal_shopify_cart_${STORE_CONFIG.shopDomain.replace(/[^a-zA-Z0-9]/g, '_')}`;

export class UniversalCart {
  constructor() {
    this.items = this.loadCart();
    this.isOpen = false;
    this.isCheckingOut = false;
    this.initDOM();
    this.render();
  }

  loadCart() {
    try {
      const data = localStorage.getItem(CART_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(this.items));
    this.render();
  }

  // 1. Consulta productos a la Storefront API de Shopify
  static async fetchProducts() {
    const query = `
      query GetProducts {
        shop {
          name
          primaryDomain {
            url
          }
        }
        products(first: 20) {
          edges {
            node {
              id
              title
              description
              handle
              featuredImage {
                url
                altText
              }
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    availableForSale
                    price {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const res = await fetch(`https://${STORE_CONFIG.shopDomain}/api/${STORE_CONFIG.apiVersion}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': STORE_CONFIG.storefrontToken,
        },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      
      return {
        shop: json.data.shop,
        products: json.data.products.edges.map(e => e.node),
      };
    } catch (err) {
      console.error('Error fetching from Shopify Storefront API:', err);
      throw err;
    }
  }

  // 2. Añadir producto al carrito
  addItem(item) {
    const existing = this.items.find(i => i.variantId === item.variantId);
    if (existing) {
      existing.quantity += item.quantity || 1;
    } else {
      this.items.push({
        variantId: item.variantId,
        productId: item.productId,
        title: item.title,
        price: parseFloat(item.price),
        image: item.image || '',
        quantity: item.quantity || 1,
      });
    }
    this.saveCart();
    this.open();
  }

  // 3. Modificar cantidad
  updateQuantity(variantId, delta) {
    const item = this.items.find(i => i.variantId === variantId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
      this.items = this.items.filter(i => i.variantId !== variantId);
    }
    this.saveCart();
  }

  // 4. Eliminar producto
  removeItem(variantId) {
    this.items = this.items.filter(i => i.variantId !== variantId);
    this.saveCart();
  }

  clear() {
    this.items = [];
    this.saveCart();
  }

  getTotalCount() {
    return this.items.reduce((acc, i) => acc + i.quantity, 0);
  }

  getTotalPrice() {
    return this.items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
  }

  open() {
    this.isOpen = true;
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    if (drawer && overlay) {
      overlay.classList.remove('opacity-0', 'pointer-events-none');
      overlay.classList.add('opacity-100');
      drawer.classList.remove('translate-x-full');
      drawer.classList.add('translate-x-0');
    }
  }

  close() {
    this.isOpen = false;
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    if (drawer && overlay) {
      overlay.classList.add('opacity-0', 'pointer-events-none');
      overlay.classList.remove('opacity-100');
      drawer.classList.add('translate-x-full');
      drawer.classList.remove('translate-x-0');
    }
  }

  // 5. Proceder al Checkout oficial de Shopify (Genera sesión y redirige)
  async checkoutShopify() {
    if (this.items.length === 0) return;
    this.isCheckingOut = true;
    this.render();

    const linesGql = this.items.map(item => `{ merchandiseId: "${item.variantId}", quantity: ${item.quantity} }`).join(', ');

    const mutation = `
      mutation {
        cartCreate(input: {
          lines: [${linesGql}]
        }) {
          cart {
            id
            checkoutUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const res = await fetch(`https://${STORE_CONFIG.shopDomain}/api/${STORE_CONFIG.apiVersion}/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': STORE_CONFIG.storefrontToken,
        },
        body: JSON.stringify({ query: mutation }),
      });

      const json = await res.json();
      if (json.errors && json.errors.length > 0) {
        throw new Error(json.errors[0].message);
      }

      const { cart, userErrors } = json.data.cartCreate;
      if (userErrors && userErrors.length > 0) {
        throw new Error(userErrors.map(e => e.message).join(', '));
      }

      if (cart && cart.checkoutUrl) {
        // Redirige directamente al checkout seguro de Shopify
        window.location.href = cart.checkoutUrl;
      } else {
        throw new Error('No se pudo generar la URL de checkout.');
      }
    } catch (err) {
      alert(`Error iniciando el checkout: ${err.message}`);
      console.error(err);
      this.isCheckingOut = false;
      this.render();
    }
  }

  // 6. Opción alternativa: Pedido formateado para WhatsApp (Pago Móvil / Zelle)
  checkoutWhatsApp() {
    if (this.items.length === 0) return;
    let msg = `*NUEVO PEDIDO // ${STORE_CONFIG.storeName}*\n\n`;
    this.items.forEach(item => {
      msg += `▪ ${item.quantity}x ${item.title} — $${(item.price * item.quantity).toFixed(2)}\n`;
    });
    msg += `\n*TOTAL:* $${this.getTotalPrice().toFixed(2)} USD\n\n`;
    msg += `Hola, deseo concretar este pedido. ¿Cuáles son los datos de pago móvil o transferencia?`;

    const url = `https://wa.me/${STORE_CONFIG.whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  initDOM() {
    // Inserta el drawer del carrito en el body si no existe
    if (!document.getElementById('cart-drawer-container')) {
      const container = document.createElement('div');
      container.id = 'cart-drawer-container';
      container.innerHTML = `
        <!-- Fondo oscuro / overlay -->
        <div id="cart-overlay" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 opacity-0 pointer-events-none transition-opacity duration-300"></div>

        <!-- Panel lateral deslizable -->
        <aside id="cart-drawer" class="fixed top-0 right-0 h-full w-full max-w-md bg-[#121318] border-l border-white/10 z-50 flex flex-col translate-x-full transition-transform duration-300 ease-out shadow-2xl">
          <!-- Cabecera -->
          <div class="flex items-center justify-between p-5 border-b border-white/10 bg-[#0e0f14]">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <h2 class="text-lg font-bold text-white tracking-wide">Tu Carrito</h2>
              <span id="cart-header-count" class="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">0 items</span>
            </div>
            <button id="cart-close-btn" class="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Lista de productos -->
          <div id="cart-items-list" class="flex-1 overflow-y-auto p-5 space-y-4">
            <!-- Items generados dinámicamente -->
          </div>

          <!-- Pie del carrito / Acciones de pago -->
          <div id="cart-footer" class="p-5 border-t border-white/10 bg-[#0e0f14] space-y-4">
            <div class="flex justify-between items-center text-sm">
              <span class="text-zinc-400">Subtotal estimado:</span>
              <span id="cart-total-amount" class="text-xl font-bold text-white font-mono">$0.00 USD</span>
            </div>
            <div class="text-[11px] text-zinc-500 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
              <span>Checkout seguro procesado y cifrado por Shopify</span>
            </div>

            <div class="text-[10px] text-zinc-400 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5 flex items-center justify-between">
              <span>🔑 Clave móvil (Sandbox): <strong class="text-white font-mono">tewvay</strong></span>
              <a href="https://jolex-sandbox.myshopify.com/password" target="_blank" rel="noopener noreferrer" class="text-emerald-400 hover:underline">Desbloquear</a>
            </div>

            <button id="cart-checkout-btn" class="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-all transform active:scale-[0.98] shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
              <span id="checkout-btn-text">Proceder al Pago con Shopify</span>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>

            <button id="cart-whatsapp-btn" class="w-full py-2.5 px-4 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-medium rounded-lg border border-white/5 transition-colors flex items-center justify-center gap-2">
              <span>O pedir por WhatsApp (Pago Móvil / Zelle)</span>
            </button>
          </div>
        </aside>
      `;
      document.body.appendChild(container);

      // Event listeners del Drawer
      document.getElementById('cart-close-btn').onclick = () => this.close();
      document.getElementById('cart-overlay').onclick = () => this.close();
      document.getElementById('cart-checkout-btn').onclick = () => this.checkoutShopify();
      document.getElementById('cart-whatsapp-btn').onclick = () => this.checkoutWhatsApp();
    }
  }

  render() {
    const totalCount = this.getTotalCount();
    const totalPrice = this.getTotalPrice();

    // Actualiza badges flotantes en la página
    document.querySelectorAll('.cart-badge-count').forEach(el => {
      el.textContent = totalCount;
      el.classList.toggle('hidden', totalCount === 0);
    });

    const headerCount = document.getElementById('cart-header-count');
    if (headerCount) headerCount.textContent = `${totalCount} item${totalCount === 1 ? '' : 's'}`;

    const totalAmount = document.getElementById('cart-total-amount');
    if (totalAmount) totalAmount.textContent = `$${totalPrice.toFixed(2)} USD`;

    const list = document.getElementById('cart-items-list');
    const footer = document.getElementById('cart-footer');
    const checkoutBtn = document.getElementById('cart-checkout-btn');
    const checkoutText = document.getElementById('checkout-btn-text');

    if (!list) return;

    if (this.isCheckingOut) {
      if (checkoutBtn) checkoutBtn.disabled = true;
      if (checkoutText) checkoutText.textContent = 'Conectando con Shopify...';
    } else {
      if (checkoutBtn) checkoutBtn.disabled = this.items.length === 0;
      if (checkoutText) checkoutText.textContent = 'Proceder al Pago con Shopify';
    }

    if (this.items.length === 0) {
      list.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
          <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 text-zinc-600">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <p class="text-sm font-medium text-zinc-400 mb-1">Tu carrito está vacío</p>
          <p class="text-xs text-zinc-600 max-w-xs">Añade productos de prueba desde la página para ver cómo calcula el total.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = this.items.map(item => `
      <div class="flex gap-4 p-3.5 bg-white/[0.03] border border-white/5 rounded-xl">
        <div class="w-16 h-16 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 border border-white/10 flex items-center justify-center">
          ${item.image ? `<img src="${item.image}" alt="${item.title}" class="w-full h-full object-cover">` : `
            <svg class="w-6 h-6 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          `}
        </div>
        <div class="flex-1 flex flex-col justify-between min-w-0">
          <div class="flex justify-between items-start gap-2">
            <h4 class="text-sm font-medium text-zinc-200 truncate">${item.title}</h4>
            <button class="cart-remove-btn text-zinc-500 hover:text-red-400 transition-colors p-0.5" data-id="${item.variantId}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <div class="flex items-center justify-between mt-2">
            <span class="text-sm font-mono font-bold text-emerald-400">$${(item.price * item.quantity).toFixed(2)}</span>
            <div class="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg px-2 py-1">
              <button class="cart-qty-minus text-zinc-400 hover:text-white px-1 font-bold text-xs" data-id="${item.variantId}">−</button>
              <span class="text-xs font-mono font-medium text-white px-1.5">${item.quantity}</span>
              <button class="cart-qty-plus text-zinc-400 hover:text-white px-1 font-bold text-xs" data-id="${item.variantId}">+</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Listeners de los botones dentro de la lista
    list.querySelectorAll('.cart-remove-btn').forEach(btn => {
      btn.onclick = () => this.removeItem(btn.dataset.id);
    });
    list.querySelectorAll('.cart-qty-minus').forEach(btn => {
      btn.onclick = () => this.updateQuantity(btn.dataset.id, -1);
    });
    list.querySelectorAll('.cart-qty-plus').forEach(btn => {
      btn.onclick = () => this.updateQuantity(btn.dataset.id, 1);
    });
  }
}
