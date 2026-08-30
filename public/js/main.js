
// ============================================
// SHARED JAVASCRIPT - All pages
// ============================================

function initAllPages() {
  try { initNavbar(); } catch(e) { console.error('Navbar error:', e); }
  try { highlightActivePage(); } catch(e) { console.error('Highlight error:', e); }
  try { loadTeamPage(); } catch(e) { console.error('Team error:', e); }
  try { loadWhatsAppDropdown(); } catch(e) { console.error('WhatsApp error:', e); }
  try { loadServicesPage(); } catch(e) { console.error('Services error:', e); }
  try { loadPortfolioPage(); } catch(e) { console.error('Portfolio error:', e); }
  try { loadReviewsPage(); } catch(e) { console.error('Reviews error:', e); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllPages);
} else {
  initAllPages();
}

// ============================================
// 1. NAVBAR & MOBILE DRAWER INITIALIZATION
// ============================================
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  // 1. Check or create Mobile Hamburger Toggle Button
  let toggleBtn = document.querySelector('.mobile-menu-toggle');
  if (!toggleBtn) {
    toggleBtn = document.createElement('button');
    toggleBtn.className = 'mobile-menu-toggle';
    toggleBtn.setAttribute('aria-label', 'Toggle Navigation');
    toggleBtn.innerHTML = '☰';
    navbar.appendChild(toggleBtn);
  }

  // 2. Check or create Mobile Navigation Drawer
  let drawer = document.querySelector('.mobile-nav-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.className = 'mobile-nav-drawer';

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    drawer.innerHTML = `
      <a href="index.html" class="${currentPage === 'index.html' || currentPage === '' ? 'active' : ''}"><span>🏠 Home</span> <span>→</span></a>
      <a href="services.html" class="${currentPage === 'services.html' ? 'active' : ''}"><span>🛠️ Services</span> <span>→</span></a>
      <a href="pricing.html" class="${currentPage === 'pricing.html' ? 'active' : ''}"><span>💎 Pricing</span> <span>→</span></a>
      <a href="portfolio.html" class="${currentPage === 'portfolio.html' ? 'active' : ''}"><span>📁 Portfolio</span> <span>→</span></a>
      <a href="team.html" class="${currentPage === 'team.html' ? 'active' : ''}"><span>👥 Team</span> <span>→</span></a>
      <a href="reviews.html" class="${currentPage === 'reviews.html' ? 'active' : ''}"><span>⭐ Reviews</span> <span>→</span></a>
      <a href="contact.html" class="${currentPage === 'contact.html' ? 'active' : ''}"><span>📬 Contact</span> <span>→</span></a>
      
      <div class="mobile-actions">
        <a href="contact.html" class="btn-quote" style="border-radius:10px;">🚀 Get a Quote</a>
        <button class="btn-whatsapp" id="mobileWaBtn" style="border-radius:10px; width:100%; justify-content:center;">💬 WhatsApp Team</button>
        <a href="admin-login.html" class="btn-admin" style="border-radius:10px; justify-content:center;">🔒 Admin Portal</a>
      </div>
    `;

    document.body.appendChild(drawer);
  }

  // Toggle drawer on click
  toggleBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    drawer.classList.toggle('active');
    toggleBtn.innerHTML = drawer.classList.contains('active') ? '✕' : '☰';
  });

  // Close drawer on click outside
  document.addEventListener('click', function(e) {
    if (!drawer.contains(e.target) && !toggleBtn.contains(e.target)) {
      drawer.classList.remove('active');
      toggleBtn.innerHTML = '☰';
    }
  });

  // Wire up mobile WhatsApp button in drawer
  const mobileWaBtn = document.getElementById('mobileWaBtn');
  if (mobileWaBtn) {
    mobileWaBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const whatsappBtn = document.querySelector('.navbar .btn-whatsapp') || document.getElementById('whatsappBtn');
      if (whatsappBtn) {
        whatsappBtn.click();
      }
    });
  }
}


// ============================================
// 2. HIGHLIGHT ACTIVE PAGE
// ============================================
function highlightActivePage() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const navLinks = document.querySelectorAll('.navbar-links a');
  
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html') || (currentPage === '/' && href === 'index.html')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

// ============================================
// SINGLETON TEAM DATA FETCHER (Eliminates Duplicate Requests)
// ============================================
let cachedTeamPromise = null;
function fetchTeamData(forceRefresh = false) {
  if (!cachedTeamPromise || forceRefresh) {
    cachedTeamPromise = fetch('/api/team')
      .then(res => {
        if (!res.ok) throw new Error('API status ' + res.status);
        return res.json();
      })
      .then(data => {
        if (!data || !data.success) throw new Error('Unsuccessful team response');
        return data;
      })
      .catch(err => {
        console.error('Failed fetching team:', err);
        cachedTeamPromise = null;
        throw err;
      });
  }
  return cachedTeamPromise;
}

// ============================================
// 3. WHATSAPP DROPDOWN
// ============================================
async function loadWhatsAppDropdown() {
  const whatsappBtn = document.querySelector('.navbar .btn-whatsapp') || document.getElementById('whatsappDropdownBtn');
  if (!whatsappBtn) return;

  let dropdown = document.getElementById('whatsappDropdown') || document.getElementById('whatsappMenu');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'whatsappDropdown';
    dropdown.className = 'whatsapp-dropdown';
    if (whatsappBtn.parentElement) {
      whatsappBtn.parentElement.style.position = 'relative';
      whatsappBtn.parentElement.appendChild(dropdown);
    }
  }

  // Toggle on click
  whatsappBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdown.classList.toggle('show');
    dropdown.classList.toggle('active');
  });

  // Close on outside click
  document.addEventListener('click', function() {
    dropdown.classList.remove('show');
    dropdown.classList.remove('active');
  });

  // Fetch data via singleton
  try {
    const data = await fetchTeamData();
    const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.team) ? data.team : []);

    if (data.success && list.length > 0) {
      const sorted = [...list].sort((a, b) => {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        return 0;
      });

      dropdown.innerHTML = `
        <div class="dropdown-header">
          <strong>📱 Contact via WhatsApp</strong>
          <small>Select a team member to chat</small>
        </div>
        ${sorted.map(member => {
          const isCEO = Boolean(member.isFeatured);
          const waNum = (member.whatsappNumber || '').replace(/[^0-9]/g, '');
          return `
            <a href="https://wa.me/${waNum}" 
               target="_blank" class="dropdown-item"
               style="${isCEO ? 'border-left: 3px solid #ff0050; background: rgba(255,0,80,0.05);' : ''}">
              <img src="${member.image || 'https://via.placeholder.com/40'}" 
                   alt="${member.name || 'Member'}"
                   onerror="this.onerror=null; this.src='https://via.placeholder.com/40'" />
              <div class="info">
                <strong style="${isCEO ? 'color: #ff0050;' : ''}">${member.name || ''} ${isCEO ? '<span style="font-size:9px;background:#ff0050;color:#fff;padding:2px 6px;border-radius:8px;margin-left:5px;">CEO</span>' : ''}</strong>
                <small>${member.role || ''}</small>
              </div>
              <span class="wa-icon">💬</span>
            </a>
          `;
        }).join('')}
      `;
    }
  } catch (error) {
    console.error('WhatsApp dropdown error:', error);
  }
}

// ============================================
// 4. LOAD TEAM (for team.html and home)
// ============================================
async function loadTeamPage() {
  const grids = document.querySelectorAll('#teamGrid, #homeTeamGrid');
  if (!grids || grids.length === 0) return;

  try {
    const data = await fetchTeamData();
    const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.team) ? data.team : []);

    if (data.success && list.length > 0) {
      const sorted = [...list].sort((a, b) => {
        if (a.isFeatured && !b.isFeatured) return -1;
        if (!a.isFeatured && b.isFeatured) return 1;
        return 0;
      });

      const cardsHtml = sorted.map(member => {
        const isCEO = Boolean(member.isFeatured);
        const waNum = (member.whatsappNumber || '').replace(/[^0-9]/g, '');
        const avatarSrc = member.image || 'https://via.placeholder.com/100';
        return `
          <div class="team-card ${isCEO ? 'ceo' : ''}">
            ${isCEO ? '<div class="ceo-badge">🔴 CEO / FOUNDER</div>' : ''}
            <img src="${avatarSrc}" 
                 alt="${member.name || 'Team Member'}" class="team-avatar"
                 onerror="this.onerror=null; this.src='https://via.placeholder.com/100'" />
            <h3 class="team-name" style="${isCEO ? 'color: #ff0050;' : ''}">${member.name || ''}</h3>
            <p class="team-role" style="${isCEO ? 'color: #ff0050;' : ''}">${member.role || ''}</p>
            <p class="team-desc">${member.description || ''}</p>
            <a href="https://wa.me/${waNum}" 
               target="_blank" class="whatsapp-btn">
              💬 Chat on WhatsApp
            </a>
          </div>
        `;
      }).join('');

      grids.forEach(g => {
        g.innerHTML = cardsHtml;
      });
    } else {
      grids.forEach(g => {
        g.innerHTML = '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.5);grid-column:1/-1;"><p>No team members added yet.</p></div>';
      });
    }
  } catch (error) {
    console.error('Team load error:', error);
    grids.forEach(g => {
      g.innerHTML = '<div style="text-align:center;padding:40px;color:#ff0050;grid-column:1/-1;"><p>⚠️ Failed to load team members.</p></div>';
    });
  }
}

// ============================================
// SINGLETON SERVICES DATA FETCHER (Eliminates Duplicate Requests)
// ============================================
let cachedServicesPromise = null;
function fetchServicesData(forceRefresh = false) {
  if (!cachedServicesPromise || forceRefresh) {
    cachedServicesPromise = fetch('/api/services')
      .then(res => {
        if (!res.ok) throw new Error('API status ' + res.status);
        return res.json();
      })
      .then(data => {
        if (!data || !data.success) throw new Error('Unsuccessful services response');
        return data;
      })
      .catch(err => {
        console.error('Failed fetching services:', err);
        cachedServicesPromise = null;
        throw err;
      });
  }
  return cachedServicesPromise;
}

// ============================================
// 5. LOAD SERVICES (for services.html)
// ============================================
async function loadServicesPage() {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;

  try {
    const data = await fetchServicesData();
    const list = data.data || data.services || [];

    if (data.success && list.length > 0) {
      grid.innerHTML = list.map(service => {
        const iconClass = service.icon && service.icon.includes('fa-') ? service.icon : (service.icon ? `fa-solid fa-${service.icon}` : 'fa-solid fa-code');
        return `
          <div class="card service-card">
            ${service.image ? `
              <div class="service-cover-img" style="width:100%; height:160px; border-radius:12px; overflow:hidden; margin-bottom:16px;">
                <img src="${service.image}" alt="${service.title}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.parentElement.style.display='none'" />
              </div>
            ` : `
              <div class="card-icon" style="background: ${service.color || 'rgba(0,200,255,0.1)'};">
                <i class="${iconClass} text-cyan-400"></i>
              </div>
            `}
            <h3>${service.title}</h3>
            <p>${service.description}</p>
            ${service.price ? `<div style="margin-top:12px; font-weight:700; color:#00f0ff; font-size:14px;">${service.price.includes('PKR') ? service.price : service.price + ' PKR'}</div>` : ''}
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    console.error('Services load error:', error);
  }
}

// ============================================
// 6. LOAD PORTFOLIO (for portfolio.html)
// ============================================
async function loadPortfolioPage() {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/portfolio');
    const data = await res.json();
    const list = data.data || data.projects || data.portfolio || [];

    if (data.success && list.length > 0) {
      grid.innerHTML = list.map(project => `
        <div class="card">
          <img src="${project.image || 'https://via.placeholder.com/400x200'}" alt="${project.title}" 
               style="width:100%;height:200px;object-fit:cover;border-radius:12px;margin-bottom:15px;"
               onerror="this.src='https://via.placeholder.com/400x200'" />
          <div style="font-size:11px;color:#00c8ff;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
            ${project.category || 'Web'}
          </div>
          <h3>${project.title}</h3>
          <p>${project.description}</p>
          ${(project.technologies && project.technologies.length > 0) ? `
          <div style="margin-top:15px;display:flex;gap:8px;flex-wrap:wrap;">
            ${project.technologies.map(t => `<span style="padding:4px 10px;background:rgba(255,255,255,0.05);border-radius:6px;font-size:12px;">${t}</span>`).join('')}
          </div>` : ''}
          ${(project.demoUrl || project.liveLink) ? `
          <div style="margin-top:15px;display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:12px;color:rgba(255,255,255,0.4);">${project.category || 'Project'}</span>
            <a href="${project.demoUrl || project.liveLink}" target="_blank" style="color:#00c8ff;font-size:13px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
              Live Demo ↗
            </a>
          </div>` : ''}
        </div>
      `).join('');
    } else {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: rgba(255,255,255,0.5); font-family: monospace;">No projects added yet.</div>';
    }
  } catch (error) {
    console.error('Portfolio load error:', error);
  }
}

// ============================================
// 7. LOAD REVIEWS (for reviews.html)
// ============================================
async function loadReviewsPage() {
  const grid = document.getElementById('reviewsGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/reviews');
    const data = await res.json();
    const list = data.data || data.reviews || [];

    if (data.success && list.length > 0) {
      grid.innerHTML = list.map(review => `
        <div class="card">
          <div style="color:#ffd700;font-size:18px;margin-bottom:15px;">
            ${'⭐'.repeat(review.rating || 5)}
          </div>
          <p style="font-style:italic;margin-bottom:20px;">"${review.text || review.comment || ''}"</p>
          <div style="display:flex;align-items:center;gap:12px;">
            <img src="${review.image || review.avatar || 'https://via.placeholder.com/45'}" alt="${review.name || review.clientName || 'Client'}" 
                 style="width:45px;height:45px;border-radius:50%;object-fit:cover;"
                 onerror="this.src='https://via.placeholder.com/45'" />
            <div>
              <strong>${review.name || review.clientName || 'Client'}</strong>
              <div style="font-size:12px;color:rgba(255,255,255,0.5);">${review.role || review.position || review.clientRole || ''}</div>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Reviews load error:', error);
  }
}
