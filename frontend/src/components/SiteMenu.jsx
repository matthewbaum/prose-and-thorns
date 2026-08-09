import React, { useEffect, useRef, useState } from 'react';
import SubmissionModal from './SubmissionModal.jsx';
import '../styles/SiteMenu.css';

const FORM_ITEMS = [
  { type: 'contact', label: 'Contact' },
  { type: 'review', label: 'Review a book' },
  { type: 'partnership', label: 'Partnership' },
];

// About is a navigation, not a form submission — it's grouped here with
// Contact/Review/Partnership because all four are the same kind of
// infrequent, informational destination, not because it works the same way
// under the hood.
export default function SiteMenu({ onNavigateAbout, aboutActive }) {
  const [open, setOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="site-menu" ref={menuRef}>
      <button
        type="button"
        className="site-menu-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label="More options"
        aria-expanded={open}
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <div className="site-menu-dropdown">
          <button
            type="button"
            className={`site-menu-item${aboutActive ? ' active' : ''}`}
            onClick={() => {
              onNavigateAbout();
              setOpen(false);
            }}
          >
            About
          </button>
          {FORM_ITEMS.map((item) => (
            <button
              key={item.type}
              type="button"
              className="site-menu-item"
              onClick={() => {
                setActiveModal(item.type);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {activeModal && <SubmissionModal type={activeModal} onClose={() => setActiveModal(null)} />}
    </div>
  );
}
