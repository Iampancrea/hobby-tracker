// Auth & Quick PIN Lock Controller
const Auth = {
  currentPin: '',
  hasPin: false,

  async init() {
    await Storage.init();
    Sync.init();

    const form = document.getElementById('login-form');
    const pinPad = document.getElementById('pin-pad-container');
    const toggleToPassword = document.getElementById('use-password-link');
    const toggleToPin = document.getElementById('use-pin-link');

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handlePasswordSubmit();
      });
    }

    if (toggleToPassword) {
      toggleToPassword.addEventListener('click', (e) => {
        e.preventDefault();
        this.showPasswordForm();
      });
    }

    if (toggleToPin) {
      toggleToPin.addEventListener('click', (e) => {
        e.preventDefault();
        this.showPinPad();
      });
    }

    // Attach PIN button handlers
    document.querySelectorAll('.pin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = btn.dataset.val;
        if (val === 'back') {
          this.handlePinBack();
        } else if (val !== undefined) {
          this.handlePinDigit(val);
        }
      });
    });

    // Keyboard support for desktop PIN entry
    window.addEventListener('keydown', (e) => {
      const pinContainer = document.getElementById('pin-pad-container');
      if (pinContainer && pinContainer.style.display !== 'none' && document.getElementById('login-screen').style.display !== 'none') {
        if (e.key >= '0' && e.key <= '9') {
          this.handlePinDigit(e.key);
        } else if (e.key === 'Backspace') {
          this.handlePinBack();
        }
      }
    });

    // Check setup status
    await this.evaluateAuthState();
  },

  async evaluateAuthState() {
    try {
      const status = await Storage.checkSetup();
      const subtitle = document.getElementById('login-subtitle');
      const confirmGroup = document.getElementById('confirm-password-group');
      const pinSetupGroup = document.getElementById('setup-pin-group');
      const loginBtn = document.getElementById('login-btn');

      if (!status.passwordSet) {
        // Initial first-time setup
        document.title = 'Hobby Tracker (Locked)';
        subtitle.textContent = 'Create your master password & PIN';
        confirmGroup.style.display = 'block';
        if (pinSetupGroup) pinSetupGroup.style.display = 'block';
        loginBtn.textContent = 'Create Vault';
        this.showPasswordForm();
      } else {
        // Already configured
        this.hasPin = status.hasPin;
        confirmGroup.style.display = 'none';
        if (pinSetupGroup) pinSetupGroup.style.display = 'none';
        loginBtn.textContent = 'Unlock Vault';

        if (Storage.isUnlocked()) {
          this.showApp();
        } else {
          document.title = 'Hobby Tracker (Locked)';
          if (this.hasPin) {
            this.showPinPad();
          } else {
            this.showPasswordForm();
          }
        }
      }
    } catch (e) {
      console.error('Auth state evaluation error:', e);
    }
  },

  showPinPad() {
    this.currentPin = '';
    this.updatePinDots();
    document.getElementById('login-form').style.display = 'none';
    const pinPad = document.getElementById('pin-pad-container');
    if (pinPad) pinPad.style.display = 'flex';
    document.getElementById('login-subtitle').textContent = 'Enter Quick PIN';
    this.clearError();
  },

  showPasswordForm() {
    const pinPad = document.getElementById('pin-pad-container');
    if (pinPad) pinPad.style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    this.clearError();
  },

  handlePinDigit(digit) {
    if (this.currentPin.length < 4) {
      this.currentPin += digit;
      this.updatePinDots();

      if (this.currentPin.length === 4) {
        setTimeout(() => this.submitPin(), 50);
      }
    }
  },

  handlePinBack() {
    if (this.currentPin.length > 0) {
      this.currentPin = this.currentPin.slice(0, -1);
      this.updatePinDots();
      this.clearError();
    }
  },

  updatePinDots() {
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('filled', idx < this.currentPin.length);
    });
  },

  async submitPin() {
    const errorDiv = document.getElementById('login-error');
    try {
      await Storage.loginWithPin(this.currentPin);
      this.showApp();
    } catch (e) {
      this.showError('Incorrect PIN');
      // Shake dots animation
      const dotsContainer = document.querySelector('.pin-dots');
      if (dotsContainer) {
        dotsContainer.classList.add('shake');
        setTimeout(() => dotsContainer.classList.remove('shake'), 400);
      }
      this.currentPin = '';
      this.updatePinDots();
    }
  },

  async handlePasswordSubmit() {
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm-password').value;
    const pinInput = document.getElementById('setup-pin')?.value;
    const confirmGroup = document.getElementById('confirm-password-group');

    this.clearError();
    const isSetup = confirmGroup.style.display !== 'none';

    if (isSetup) {
      if (password !== confirm) {
        this.showError('Passwords do not match');
        return;
      }
      if (pinInput && pinInput.length !== 4 && pinInput.length > 0) {
        this.showError('PIN must be exactly 4 digits (or leave blank)');
        return;
      }

      try {
        await Storage.setup(password, pinInput || null);
        this.showApp();
      } catch (e) {
        this.showError(e.message);
      }
    } else {
      try {
        await Storage.loginWithPassword(password);
        this.showApp();
      } catch (e) {
        this.showError(e.message);
      }
    }
  },

  showError(msg) {
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) {
      errorDiv.textContent = msg;
      errorDiv.style.display = 'block';
    }
  },

  clearError() {
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) {
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';
    }
  },

  lockApp() {
    Storage.lock();
    document.title = 'Hobby Tracker (Locked)';
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('password').value = '';
    document.getElementById('confirm-password').value = '';
    this.evaluateAuthState();
  },

  showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    App.init();

    // Trigger initial background sync on unlock
    Sync.syncNow({ background: true });
  }
};
