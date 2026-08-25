(function () {
  "use strict";

  var page = document.body.getAttribute("data-wst-page") || "";
  var headerTarget = document.querySelector("[data-wst-header]");
  var footerTarget = document.querySelector("[data-wst-footer]");

  function current(name) {
    return page === name ? ' aria-current="page"' : "";
  }

  if (headerTarget) {
    headerTarget.outerHTML = [
      '<header class="nav">',
      '  <div class="container nav-inner">',
      '    <a href="index.html" class="brand" aria-label="WS Technicals home">',
      '      <img class="brand-logo' + (page === "contact" ? ' brand-logo--on-dark' : '') + '" src="assets/logo/full.svg" alt="WS Technicals">',
      "    </a>",
      '    <nav class="nav-menu" aria-label="Primary navigation">',
      '      <div class="nav-item">',
      '        <a href="solutions-v4.html" class="nav-link"' + current("solutions") + '>Solutions <svg class="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>',
      '        <div class="dropdown">',
      '          <a href="solutions-v4.html">Industrial Automation</a>',
      '          <a href="solutions-v4.html">Energy &amp; Infrastructure</a>',
      '          <a href="solutions-v4.html">Mobility</a>',
      '          <a href="solutions-v4.html">Custom Battery Solutions</a>',
      "        </div>",
      "      </div>",
      '      <div class="nav-item nav-item--disabled">',
      '        <span class="nav-link nav-link--disabled" aria-disabled="true">Development <svg class="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>',
      '        <div class="dropdown">',
      '          <span class="dropdown-link--disabled">Idea &amp; Requirements</span>',
      '          <span class="dropdown-link--disabled">Feasibility Study</span>',
      '          <span class="dropdown-link--disabled">Prototype &amp; Testing</span>',
      '          <span class="dropdown-link--disabled">Industrialization</span>',
      '          <span class="dropdown-link--disabled">Compliance</span>',
      '          <span class="dropdown-link--disabled">Mass Production</span>',
      "        </div>",
      "      </div>",
      '      <div class="nav-item nav-item--disabled">',
      '        <span class="nav-link nav-link--disabled" aria-disabled="true">Production <svg class="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>',
      '        <div class="dropdown">',
      '          <span class="dropdown-link--disabled">Production Facility</span>',
      '          <span class="dropdown-link--disabled">Quality Assurance</span>',
      '          <span class="dropdown-link--disabled">Testing</span>',
      '          <span class="dropdown-link--disabled">Supply Chain</span>',
      "        </div>",
      "      </div>",
      '      <div class="nav-item nav-item--disabled">',
      '        <span class="nav-link nav-link--disabled" aria-disabled="true">BMS <svg class="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>',
      '        <div class="dropdown">',
      '          <span class="dropdown-link--disabled">Low Voltage</span>',
      '          <span class="dropdown-link--disabled">High Voltage</span>',
      '          <span class="dropdown-link--disabled">Fast Charge</span>',
      '          <span class="dropdown-link--disabled">Custom Development</span>',
      "        </div>",
      "      </div>",
      '      <div class="nav-item">',
      '        <a href="about.html" class="nav-link"' + current("about") + '>About us <svg class="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>',
      '        <div class="dropdown">',
      '          <a href="about.html#company">Who we are</a>',
      '          <a href="about.html#partners">Partner Network</a>',
      '          <a href="about.html#global">Global Presence</a>',
      '          <span class="dropdown-link--disabled">Careers</span>',
      '          <span class="dropdown-link--disabled">News</span>',
      "        </div>",
      "      </div>",
      "    </nav>",
      '    <div class="nav-cta">',
      '      <a href="contact-v2.html" class="btn btn-primary" data-wst-contact-open aria-haspopup="dialog">Get in touch</a>',
      '      <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false" id="navToggle"><span></span></button>',
      "    </div>",
      "  </div>",
      "</header>"
    ].join("\n");
  }

  if (footerTarget) {
    footerTarget.outerHTML = [
      '<footer class="footer">',
      '  <div class="container">',
      '    <div class="footer-top">',
      '      <div class="footer-brand">',
      '        <a href="index.html" class="brand" aria-label="WS Technicals home">',
      '          <img class="brand-logo brand-logo--on-dark" src="assets/logo/full.svg" alt="WS Technicals">',
      "        </a>",
      '        <p class="footer-address">WS Technicals A/S<br>Gjellerupvej 89A<br>8230 Aarhus, Denmark</p>',
      "      </div>",
      '      <div class="footer-col"><h4>Solutions</h4><ul>',
      '        <li><a href="solutions-v4.html">Industrial Automation</a></li>',
      '        <li><a href="solutions-v4.html">Energy &amp; Infrastructure</a></li>',
      '        <li><a href="solutions-v4.html">Mobility</a></li>',
      '        <li><a href="solutions-v4.html">Custom Battery Solutions</a></li>',
      "      </ul></div>",
      '      <div class="footer-col"><h4>Development</h4><ul>',
      '        <li><span class="footer-link--disabled">Idea &amp; Requirements</span></li>',
      '        <li><span class="footer-link--disabled">Feasibility Study</span></li>',
      '        <li><span class="footer-link--disabled">Prototype &amp; Testing</span></li>',
      '        <li><span class="footer-link--disabled">Compliance</span></li>',
      "      </ul></div>",
      '      <div class="footer-col"><h4>Production</h4><ul>',
      '        <li><span class="footer-link--disabled">Production Facility</span></li>',
      '        <li><span class="footer-link--disabled">Quality Assurance</span></li>',
      '        <li><span class="footer-link--disabled">Testing</span></li>',
      '        <li><span class="footer-link--disabled">Supply Chain</span></li>',
      "      </ul></div>",
      '      <div class="footer-col"><h4>Company</h4><ul>',
      '        <li><a href="about.html#company">About us</a></li>',
      '        <li><span class="footer-link--disabled">BMS Solutions</span></li>',
      '        <li><a href="contact-v2.html">Get in touch</a></li>',
      '        <li><a href="https://wstech.freshdesk.com/support/home" target="_blank" rel="noopener noreferrer">Support</a></li>',
      '        <li><span class="footer-link--disabled">Careers</span></li>',
      '        <li><span class="footer-link--disabled">News</span></li>',
      "      </ul></div>",
      "    </div>",
      '    <div class="footer-bottom">',
      '      <div class="footer-legal">',
      '        <span class="footer-copy">© 2026 WS Technicals A/S. All rights reserved.</span>',
      '        <span class="footer-terms">Salgs- og leveringsbetingelser</span>',
      "      </div>",
      '      <div class="cert-chips" aria-label="Compliance standards">',
      '        <span class="cert-chip">CE</span><span class="cert-chip">UN 38.3</span><span class="cert-chip">RoHS</span>',
      "      </div>",
      "    </div>",
      "  </div>",
      "</footer>"
    ].join("\n");
  }

  if (headerTarget && !document.querySelector("[data-wst-contact-modal]")) {
    document.body.insertAdjacentHTML("beforeend", [
      '<div class="wst-contact-modal" data-wst-contact-modal hidden>',
      '  <button class="wst-contact-modal__backdrop" type="button" data-wst-contact-close aria-label="Close contact form"></button>',
      '  <section class="wst-contact-modal__dialog on-dark" role="dialog" aria-modal="true" aria-labelledby="wst-contact-modal-title" tabindex="-1">',
      '    <button class="wst-contact-modal__close" type="button" data-wst-contact-close aria-label="Close contact form">',
      '      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3.5 3.5 14.5 14.5M14.5 3.5 3.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      "    </button>",
      '    <div class="wst-contact-modal__intro">',
      '      <span class="wst-contact-modal__eyebrow">Start a conversation</span>',
      '      <h2 id="wst-contact-modal-title">Tell us what your application needs to do.</h2>',
      '      <p>Share the operating conditions, performance targets or challenge. Our engineering team will help define the right next step.</p>',
      '      <div class="wst-contact-modal__details">',
      '        <a href="tel:+4588618388"><span>Phone</span>+45 88 61 83 88</a>',
      '        <a href="mailto:wstech@wstech.dk"><span>Email</span>wstech@wstech.dk</a>',
      "      </div>",
      "    </div>",
      '    <form class="contact-form wst-contact-modal__form" data-wst-modal-form>',
      '      <div class="wst-contact-modal__fields">',
      '        <div class="field"><label for="wst-modal-name">Name</label><input id="wst-modal-name" name="name" type="text" autocomplete="name" placeholder="Jane Doe"></div>',
      '        <div class="field"><label for="wst-modal-company">Company</label><input id="wst-modal-company" name="company" type="text" autocomplete="organization" placeholder="Company name"></div>',
      '        <div class="field"><label for="wst-modal-email">Email</label><input id="wst-modal-email" name="email" type="email" autocomplete="email" placeholder="jane@company.com"></div>',
      '        <div class="field"><label for="wst-modal-country">Country</label><input id="wst-modal-country" name="country" type="text" autocomplete="country-name" placeholder="Country"></div>',
      '        <div class="field field--wide"><label for="wst-modal-application">Application</label><select id="wst-modal-application" name="application"><option value="" selected disabled>Select an application</option><option>Drone</option><option>Material Handling</option><option>Robotics</option><option>Maritime</option><option>UPS</option><option>Heavy Machinery</option><option>Other</option></select></div>',
      '        <div class="field field--wide"><label for="wst-modal-message">Message</label><textarea id="wst-modal-message" name="message" rows="4" placeholder="Tell us about your project"></textarea></div>',
      "      </div>",
      '      <button type="submit" class="btn btn-on-dark wst-contact-modal__submit">Send message</button>',
      '      <p class="wst-contact-modal__note">All fields are optional. We only use your details to respond to your enquiry.</p>',
      '      <p class="wst-contact-modal__success" data-wst-modal-success role="status" hidden>Thank you. Your enquiry is ready for our team.</p>',
      "    </form>",
      "  </section>",
      "</div>"
    ].join("\n"));

    var modal = document.querySelector("[data-wst-contact-modal]");
    var dialog = modal.querySelector(".wst-contact-modal__dialog");
    var modalForm = modal.querySelector("[data-wst-modal-form]");
    var modalSuccess = modal.querySelector("[data-wst-modal-success]");
    var lastModalTrigger = null;
    var closeTimer = null;

    function modalFocusable() {
      return Array.prototype.slice.call(dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    }

    function openContactModal(event) {
      if (event) event.preventDefault();
      window.clearTimeout(closeTimer);
      lastModalTrigger = event && event.currentTarget ? event.currentTarget : document.activeElement;
      modal.hidden = false;
      document.body.classList.add("wst-modal-open");
      window.requestAnimationFrame(function () {
        modal.classList.add("is-open");
        var firstField = dialog.querySelector("input, select, textarea");
        (firstField || dialog).focus({ preventScroll: true });
      });
    }

    function closeContactModal() {
      modal.classList.remove("is-open");
      document.body.classList.remove("wst-modal-open");
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      closeTimer = window.setTimeout(function () {
        modal.hidden = true;
        if (lastModalTrigger && typeof lastModalTrigger.focus === "function") lastModalTrigger.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 320);
    }

    document.querySelectorAll("[data-wst-contact-open]").forEach(function (trigger) {
      trigger.addEventListener("click", openContactModal);
    });
    modal.querySelectorAll("[data-wst-contact-close]").forEach(function (button) {
      button.addEventListener("click", closeContactModal);
    });
    modal.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeContactModal();
        return;
      }
      if (event.key !== "Tab") return;
      var focusable = modalFocusable();
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    modalForm.addEventListener("submit", function (event) {
      event.preventDefault();
      modalSuccess.hidden = false;
    });
  }

  var PRODUCT_INFO = {
    "Multirotor UAV": "Custom battery packs engineered for payload capacity, flight time and rapid field swaps in multirotor platforms.",
    "Fixed-Wing UAV": "Long-range power systems balancing weight, endurance and reliability for fixed-wing aircraft.",
    "VTOL UAV": "Battery systems tuned for the high peak-power demands of vertical takeoff paired with efficient cruise flight.",
    "Long-Endurance UAV": "High energy density packs designed to extend flight time without adding excess weight.",
    "Unmanned Surface Vehicle": "Marine-grade battery systems built for autonomous surface vessels operating in harsh conditions.",
    "Unmanned Ground Vehicle": "Rugged battery packs engineered for remote and autonomous ground operation in demanding environments.",
    "AGV and AMR": "Battery systems built for continuous shift cycles and fast opportunity charging in automated warehouses.",
    "Electric Forklift": "High-cycle battery packs engineered for daily duty in material handling and warehouse operations.",
    "Humanoid Robotics": "Compact, high-density battery systems built for the space and weight constraints of humanoid platforms.",
    "Industrial Robotics": "Custom power systems for robotic arms and automated production line equipment.",
    "Electric Workboat": "Marine battery systems engineered for electric propulsion and onboard power in commercial workboats.",
    "Autonomous Marine Platform": "Battery systems designed for the endurance and reliability autonomous marine missions demand.",
    "Modular UPS Cabinet": "Scalable battery banks engineered for uninterrupted backup power in critical infrastructure.",
    "Infrastructure Bank": "Large-format battery installations built for grid support and facility-scale energy storage.",
    "Outdoor Maintenance": "Battery systems built for the duty cycles of outdoor maintenance and grounds equipment.",
    "Municipal Equipment": "Custom power systems engineered for municipal vehicles and public works equipment.",
    "Electric Excavator": "High-voltage battery packs engineered for the torque and duty cycle of electric excavators.",
    "Agricultural Tractor": "Battery systems built for the power demands and duty cycles of agricultural machinery.",
    "Pallet Truck": "Compact battery packs engineered for the daily cycles of electric pallet trucks.",
    "Utility Vehicle": "Custom battery systems built for electric utility vehicles operating across varied terrain."
  };

  if (headerTarget && !document.querySelector("[data-wst-product-modal]")) {
    document.body.insertAdjacentHTML("beforeend", [
      '<div class="wst-product-modal" data-wst-product-modal hidden>',
      '  <button class="wst-product-modal__backdrop" type="button" data-wst-product-close aria-label="Close"></button>',
      '  <section class="wst-product-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="wst-product-modal-title" tabindex="-1">',
      '    <button class="wst-product-modal__close" type="button" data-wst-product-close aria-label="Close">',
      '      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3.5 3.5 14.5 14.5M14.5 3.5 3.5 14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      "    </button>",
      '    <span class="wst-product-modal__eyebrow">Application</span>',
      '    <h2 id="wst-product-modal-title" data-wst-product-title></h2>',
      "    <p data-wst-product-desc></p>",
      '    <a href="contact-v2.html" class="btn btn-on-dark">Discuss this application</a>',
      "  </section>",
      "</div>"
    ].join("\n"));

    var productModal = document.querySelector("[data-wst-product-modal]");
    var productDialog = productModal.querySelector(".wst-product-modal__dialog");
    var productTitle = productModal.querySelector("[data-wst-product-title]");
    var productDesc = productModal.querySelector("[data-wst-product-desc]");
    var lastProductTrigger = null;
    var productCloseTimer = null;

    function productModalFocusable() {
      return Array.prototype.slice.call(productDialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    }

    function openProductModal(card) {
      var img = card.querySelector("img");
      var name = img ? img.getAttribute("alt") : "";
      productTitle.textContent = name;
      productDesc.textContent = PRODUCT_INFO[name] || "Every system is engineered around your application, from operating profile to certification.";

      window.clearTimeout(productCloseTimer);
      lastProductTrigger = card;
      productModal.hidden = false;
      document.body.classList.add("wst-modal-open");
      window.requestAnimationFrame(function () {
        productModal.classList.add("is-open");
        productDialog.focus({ preventScroll: true });
      });
    }

    function closeProductModal() {
      productModal.classList.remove("is-open");
      document.body.classList.remove("wst-modal-open");
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      productCloseTimer = window.setTimeout(function () {
        productModal.hidden = true;
        if (lastProductTrigger && typeof lastProductTrigger.focus === "function") lastProductTrigger.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 320);
    }

    document.addEventListener("click", function (event) {
      var card = event.target.closest(".cat-card, .app-tile");
      if (!card) return;
      event.preventDefault();
      openProductModal(card);
    });
    productModal.querySelectorAll("[data-wst-product-close]").forEach(function (button) {
      button.addEventListener("click", closeProductModal);
    });
    productModal.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeProductModal();
        return;
      }
      if (event.key !== "Tab") return;
      var focusable = productModalFocusable();
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }
})();
