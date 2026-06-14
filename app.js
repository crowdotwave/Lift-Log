/* chart tabs */
.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.chart-tabs {
  display: flex;
  gap: 4px;
}
.chart-tab {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.12);
  background: transparent;
  color: #8a8a96;
  cursor: pointer;
  transition: all 0.15s;
}
.chart-tab.active {
  background: rgba(59,130,246,0.15);
  color: #60a5fa;
  border-color: rgba(59,130,246,0.3);
}

/* PR badge in history */
.pr-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  background: rgba(34,197,94,0.12);
  color: #22c55e;
  border: 1px solid rgba(34,197,94,0.3);
  border-radius: 4px;
  padding: 1px 5px;
  margin-left: 6px;
  vertical-align: middle;
}

/* volume column in session rows */
.session-vol {
  font-size: 12px;
  color: #8a8a96;
  margin-right: 10px;
  white-space: nowrap;
}
