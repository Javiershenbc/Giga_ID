const qs = (s) => document.querySelector(s);
const log = (m) => {
    const box = qs('#log');
    const t = new Date().toLocaleTimeString();
    box.textContent += `\n[${t}] ${m}`;
    box.scrollTop = box.scrollHeight;
};

let token = null;

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
qs('#loginBtn').addEventListener('click', async () => {
    try {
        const username = qs('#username').value.trim();
        const password = qs('#password').value;
        const result = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        updateAccount(result.user, result.auth);
        setAuthed(true);
        qs('#loginCard').style.display = 'none';
        await refreshBalance();
        log('Login successful');
    } catch (e) {
        log(`Login failed: ${e.message}`);
    }
});

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
