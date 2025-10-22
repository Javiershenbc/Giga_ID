const qs = (s) => document.querySelector(s);
const log = (m) => {
    const box = qs('#log');
    const t = new Date().toLocaleTimeString();
    box.textContent += `\n[${t}] ${m}`;
    box.scrollTop = box.scrollHeight;
};

let token = null;

// Check for token in URL hash (from redirect flow)
function checkUrlHash() {
    const hash = window.location.hash;
    if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const urlToken = params.get('token');
        const error = params.get('error');

        if (error) {
            log(`Login error: ${decodeURIComponent(error)}`);
            // Clear the hash
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }

        if (urlToken) {
            token = urlToken;
            setAuthed(true);
            qs('#loginCard').style.display = 'none';
            refreshBalance().catch(() => { });
            log('Login successful via redirect');
            // Clear the hash
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
}

// Check URL hash on page load
checkUrlHash();

async function api(path, opts = {}) {
    const res = await fetch(path, {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
}

function setAuthed(on) {
    const logoutBtn = qs('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.disabled = !on;
        logoutBtn.style.display = on ? '' : 'none';
    }
    qs('#infoGrid').style.display = on ? '' : 'none';
    qs('#actionsCard').style.display = on ? '' : 'none';
    [
        '#btnRefreshBalance',
        '#btnAssociate',
        '#btnShowConfig',
        '#btnPending',
        '#btnRegisterSafe',
        '#btnSend',
        '#btnProposeOwner',
        '#btnProposeDelegate',
    ].forEach((id) => (qs(id).disabled = !on));
}

function updateAccount(u, auth) {
    qs('#kvUser').textContent = u.username || '-';
    qs('#kvEmail').textContent = u.email || '-';
    qs('#kvDID').textContent = u.did || '-';
    qs('#kvAuth').textContent = u.authMethod || '-';
    qs('#kvSigner').textContent = u.signerAddress || '-';
    if (auth?.token) token = auth.token;
}

async function refreshBalance() {
    const data = await api('/api/balance');
    qs('#kvAddress').textContent = data.data.address || '-';
    qs('#kvNetwork').textContent = data.data.network || '-';
    qs('#kvBalance').textContent = data.data.balance || '-';
    log('Balance refreshed');
}

// Auth
qs('#msLoginBtn').addEventListener('click', async () => {
    try {
        const cfgRes = await fetch('/api/auth/config');
        const cfg = await cfgRes.json().catch(() => ({}));
        if (!cfg || cfg.success !== true || !cfg.clientId || !cfg.authority) {
            log('Config missing or invalid, using redirect flow...');
            window.location.href = '/api/auth/login';
            return;
        }

        const msalSrc = 'https://alcdn.msauth.net/browser/2.45.0/js/msal-browser.min.js';
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = msalSrc;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Failed to load msal-browser'));
            document.head.appendChild(s);
        });

        // eslint-disable-next-line no-undef
        if (typeof msal === 'undefined' || !msal.PublicClientApplication) {
            throw new Error('MSAL not available in window');
        }

        const msalConfig = {
            auth: {
                clientId: cfg.clientId,
                authority: cfg.authority,
                redirectUri: window.location.origin + '/callback.html',
            },
            cache: { cacheLocation: 'sessionStorage' },
        };

        // eslint-disable-next-line no-undef
        const msalInstance = new msal.PublicClientApplication(msalConfig);

        // Listen for messages from popup
        const messageHandler = (event) => {
            if (event.origin !== window.location.origin) return;
            if (event.data.type === 'AZURE_LOGIN_SUCCESS') {
                token = event.data.token;
                setAuthed(true);
                qs('#loginCard').style.display = 'none';
                refreshBalance().catch(() => { });
                log('Login successful via popup');
                window.removeEventListener('message', messageHandler);
            }
        };
        window.addEventListener('message', messageHandler);

        try {
            // eslint-disable-next-line no-undef
            const loginResp = await msalInstance.loginPopup({
                scopes: cfg.scopes,
                prompt: 'select_account'
            });
            token = loginResp && (loginResp.accessToken || (loginResp.idToken && loginResp.idToken.rawIdToken)) || null;
            if (token) {
                setAuthed(true);
                qs('#loginCard').style.display = 'none';
                await refreshBalance().catch(() => { });
                log('Login successful via popup');
                return;
            }
            log('No token returned from popup, falling back to redirect...');
        } catch (popupErr) {
            log(`Popup failed: ${popupErr && popupErr.message ? popupErr.message : String(popupErr)}`);
            log('Falling back to redirect...');
        }
        window.location.href = '/api/auth/login';
    } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        log(`Login start failed: ${msg}`);
        // Last resort fallback
        try { window.location.href = '/api/auth/login'; } catch { }
    }
});

// If callback returned tokens with hash (optional future), parse them
try {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const at = hash.get('access_token');
    if (at) {
        token = at;
        setAuthed(true);
        qs('#loginCard').style.display = 'none';
        refreshBalance().catch(() => { });
        log('Logged in via callback');
        // clear hash
        history.replaceState(null, '', window.location.pathname);
    }
} catch { }

qs('#logoutBtn').addEventListener('click', () => {
    token = null;
    setAuthed(false);
    qs('#loginCard').style.display = '';
    log('Logged out');
});

// Wallet
qs('#btnRefreshBalance').addEventListener('click', refreshBalance);

// Multisig
qs('#btnAssociate').addEventListener('click', async () => {
    try {
        const address = qs('#msafe').value.trim();
        const generateSigner = qs('#msGenerateEOA').checked;
        let signerPrivateKey = qs('#msSignerPk').value.trim();
        if (signerPrivateKey && !signerPrivateKey.startsWith('0x')) {
            signerPrivateKey = `0x${signerPrivateKey}`;
        }
        const data = await api('/api/multisig/associate', {
            method: 'POST',
            body: JSON.stringify({
                multisigWalletAddress: address,
                generateSigner,
                ...(signerPrivateKey ? { signerPrivateKey } : {}),
            }),
        });
        if (data?.data?.signerAddress) qs('#kvSigner').textContent = data.data.signerAddress;
        log('Associated with multisig');
    } catch (e) {
        log(`Associate failed: ${e.message}`);
    }
});

qs('#btnShowConfig').addEventListener('click', async () => {
    try {
        const data = await api('/api/multisig/config');
        log(`Config: ${JSON.stringify(data.data)}`);
    } catch (e) {
        log(`Config failed: ${e.message}`);
    }
});

qs('#btnPending').addEventListener('click', async () => {
    try {
        const data = await api('/api/multisig/transactions/pending');
        log(`Pending: ${JSON.stringify(data.data)}`);
    } catch (e) {
        log(`Pending failed: ${e.message}`);
    }
});

qs('#btnRegisterSafe').addEventListener('click', async () => {
    try {
        const address = qs('#msafe').value.trim();
        const network = qs('#kvNetwork').textContent || 'sepolia';
        const owners = [address];
        const threshold = 1;
        const data = await api('/api/multisig/wallets', {
            method: 'POST',
            body: JSON.stringify({ address, type: 'gnosis_safe', owners, threshold, network }),
        });
        log(`Registered safe: ${data.data?.address}`);
    } catch (e) {
        log(`Register safe failed: ${e.message}`);
    }
});

// Actions
qs('#btnSend').addEventListener('click', async () => {
    try {
        const to = qs('#toAddress').value.trim();
        const amount = qs('#amount').value.trim();
        const data = await api('/api/send-transaction', {
            method: 'POST',
            body: JSON.stringify({ to, amount }),
        });
        log(`Tx sent: ${data.data?.hash}`);
    } catch (e) {
        log(`Send failed: ${e.message}`);
    }
});

qs('#btnProposeOwner').addEventListener('click', async () => {
    try {
        const to = qs('#toAddress').value.trim();
        const amount = qs('#amount').value.trim();
        const data = await api('/api/propose-transaction', {
            method: 'POST',
            body: JSON.stringify({ to, amount }),
        });
        log(`Safe proposal: ${data.data?.safeTxHash}`);
    } catch (e) {
        log(`Propose failed: ${e.message}`);
    }
});

qs('#btnProposeDelegate').addEventListener('click', async () => {
    try {
        const to = qs('#toAddress').value.trim();
        const amount = qs('#amount').value.trim();
        const data = await api('/api/propose-transaction-delegate', {
            method: 'POST',
            body: JSON.stringify({ to, amount }),
        });
        log(`Safe delegate proposal: ${data.data?.safeTxHash}`);
    } catch (e) {
        log(`Delegate failed: ${e.message}`);
    }
});


// Initialize UI state on load
setAuthed(false);
