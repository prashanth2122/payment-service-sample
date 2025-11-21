// public/main.js
(() => {
  // Elements
  const form = document.getElementById('paymentForm');
  const payBtn = document.getElementById('payBtn');
  const status = document.getElementById('status');

  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const contactInput = document.getElementById('contact');
  const amountInput = document.getElementById('amount');

  const errName = document.getElementById('error-name');
  const errEmail = document.getElementById('error-email');
  const errContact = document.getElementById('error-contact');
  const errAmount = document.getElementById('error-amount');

  let RAZORPAY_KEY_ID = null;

  // Track touched state per field and if form submit was attempted
  const touched = { name: false, email: false, contact: false, amount: false };
  let submitAttempted = false;

  // Helpers to show/hide error only when touched or after submit
  function showError(field, message) {
    if (field === 'name') errName.textContent = message;
    if (field === 'email') errEmail.textContent = message;
    if (field === 'contact') errContact.textContent = message;
    if (field === 'amount') errAmount.textContent = message;
  }

  function clearError(field) {
    showError(field, '');
  }

  // Validators return boolean, but only display messages if touched[field] or submitAttempted
  function validateName() {
    const v = nameInput.value.trim();
    const valid = v && v.length >= 2;
    if (!valid && (touched.name || submitAttempted)) {
      if (!v) showError('name', 'Name is required.');
      else showError('name', 'Enter a valid name.');
    } else {
      clearError('name');
    }
    return valid;
  }

  function validateEmail() {
    const v = emailInput.value.trim();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = v && re.test(v);
    if (!valid && (touched.email || submitAttempted)) {
      if (!v) showError('email', 'Email is required.');
      else showError('email', 'Enter a valid email.');
    } else {
      clearError('email');
    }
    return valid;
  }

  function validateContact() {
    const digits = contactInput.value.replace(/\D/g, '').trim();
    const valid = /^[6-9]\d{9}$/.test(digits);
    if (!valid && (touched.contact || submitAttempted)) {
      if (!digits) showError('contact', 'Contact is required.');
      else showError('contact', 'Enter a valid 10-digit mobile number.');
    } else {
      clearError('contact');
      // normalize value only if valid or touched (avoid changing before user types)
      if (digits) contactInput.value = digits;
    }
    return valid;
  }

  function validateAmount() {
    const v = amountInput.value;
    const val = Number(v);
    const valid = v && !isNaN(val) && val >= 1 && /^\d+(\.\d{1,2})?$/.test(String(v));
    if (!valid && (touched.amount || submitAttempted)) {
      if (!v) showError('amount', 'Amount is required.');
      else if (isNaN(val)) showError('amount', 'Enter a valid number.');
      else if (val < 1) showError('amount', 'Minimum amount is ₹1.00');
      else showError('amount', 'Max two decimals allowed.');
    } else {
      clearError('amount');
    }
    return valid;
  }

  function validateAll() {
    const a = validateName();
    const b = validateEmail();
    const c = validateContact();
    const d = validateAmount();
    const ok = a && b && c && d && (RAZORPAY_KEY_ID !== null);
    payBtn.disabled = !ok;
    status.textContent = ok ? 'Ready to pay' : (RAZORPAY_KEY_ID ? 'Fix form errors' : 'Loading config...');
    return ok;
  }

  // Mark touched on first input/focusout etc.
  function markTouched(e) {
    const id = e.target.id;
    if (id && touched.hasOwnProperty(id)) {
      touched[id] = true;
      validateAll();
    }
  }

  // Attach listeners
  [nameInput, emailInput, contactInput, amountInput].forEach(el => {
    el.addEventListener('input', () => {
      // only validate the single field to reduce noise
      const id = el.id;
      if (id === 'name') validateName();
      if (id === 'email') validateEmail();
      if (id === 'contact') validateContact();
      if (id === 'amount') validateAmount();
      // update global state
      validateAll();
    });
    el.addEventListener('blur', markTouched);
    el.addEventListener('focus', () => {
      // don't mark touched on focus, only on blur or explicit input
    });
  });

  // Load public config
  async function loadConfig() {
    try {
      const res = await fetch('/config', { cache: 'no-store' });
      if (!res.ok) throw new Error('Config request failed');
      const data = await res.json();
      RAZORPAY_KEY_ID = data.key || null;
      window.__RAZORPAY_KEY_ID = RAZORPAY_KEY_ID;
    } catch (err) {
      console.error('Could not load config', err);
      status.textContent = 'Failed to load config';
      RAZORPAY_KEY_ID = null;
    } finally {
      validateAll();
    }
  }

  async function createOrder(amountPaise) {
    const payload = { amount: amountPaise };
    const res = await fetch('/api/payments/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('Create order failed: ' + text);
    }
    return (await res.json()).order;
  }

  function disableUI() {
    payBtn.disabled = true;
    payBtn.textContent = 'Processing...';
  }
  function enableUI() {
    payBtn.disabled = false;
    payBtn.textContent = 'Pay Now';
  }

  payBtn.addEventListener('click', async () => {
    // When user clicks pay, force showing errors if any
    submitAttempted = true;
    validateAll();

    if (!validateAll()) {
      // Focus first invalid field
      if (!validateName()) { nameInput.focus(); return; }
      if (!validateEmail()) { emailInput.focus(); return; }
      if (!validateContact()) { contactInput.focus(); return; }
      if (!validateAmount()) { amountInput.focus(); return; }
    }

    disableUI();
    status.textContent = 'Creating order...';
    try {
      const amountRupees = parseFloat(amountInput.value);
      const amountPaise = Math.round(amountRupees * 100);
      const order = await createOrder(amountPaise);

      const options = {
        key: RAZORPAY_KEY_ID || window.__RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'My App',
        description: 'Test Payment',
        order_id: order.id,
        handler: async function (response) {
          try {
            status.textContent = 'Verifying payment...';
            const verifyRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response)
            });
            const verifyJson = await verifyRes.json();
            if (verifyJson.ok) {
              status.textContent = 'Payment successful and verified!';
              alert('Payment successful and verified!');
              form.reset();
              // reset touched and submitAttempted so errors hide again
              Object.keys(touched).forEach(k => touched[k] = false);
              submitAttempted = false;
            } else {
              status.textContent = 'Payment verification failed';
              alert('Payment verification failed: ' + (verifyJson.msg || JSON.stringify(verifyJson)));
            }
          } catch (err) {
            console.error('Verification error', err);
            status.textContent = 'Verification failed';
            alert('Verification error: ' + err.message);
          } finally {
            enableUI();
            validateAll();
          }
        },
        prefill: {
          name: nameInput.value,
          email: emailInput.value,
          contact: contactInput.value
        },
        theme: { color: '#0a79df' }
      };

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        console.warn('Payment failed', resp);
        status.textContent = 'Payment failed: ' + (resp.error && resp.error.description ? resp.error.description : 'Unknown');
        enableUI();
      });

      rzp.open();
      status.textContent = 'Waiting for payment...';
    } catch (err) {
      console.error(err);
      status.textContent = 'Error: ' + err.message;
      alert('Error: ' + err.message);
      enableUI();
    }
  });

  // initial load
  loadConfig();
})();
