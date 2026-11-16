import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  Camera,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Search,
  Sparkles,
  Truck,
  Users,
  X,
} from 'lucide-react';
import type { MastProjectState } from '@/entities/project/types';
import {
  groupSearchResults,
  searchProject,
  type SearchCategory,
  type SearchResultItem,
} from '@/shared/search/globalProjectSearch';

export interface GlobalSearchModalProps {
  project: MastProjectState;
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (item: SearchResultItem) => void;
  onOpenPhotoGallery?: () => void;
}

export function GlobalSearchModal({
  project,
  isOpen,
  onClose,
  onSelectResult,
  onOpenPhotoGallery,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<SearchCategory | 'all'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveCategoryFilter('all');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Compute search results
  const allResults = useMemo(() => {
    return searchProject(project, query);
  }, [project, query]);

  const filteredResults = useMemo(() => {
    if (activeCategoryFilter === 'all') return allResults;
    return allResults.filter((r) => r.category === activeCategoryFilter);
  }, [allResults, activeCategoryFilter]);

  const categoryGroups = useMemo(() => {
    return groupSearchResults(allResults);
  }, [allResults]);

  // Reset selected index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredResults.length, activeCategoryFilter]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredResults.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % filteredResults.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredResults.length > 0) {
          setSelectedIndex((prev) => (prev - 1 + filteredResults.length) % filteredResults.length);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredResults[selectedIndex]) {
          onSelectResult(filteredResults[selectedIndex]);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredResults, selectedIndex, onClose, onSelectResult]);

  if (!isOpen) return null;

  const renderCategoryIcon = (category: SearchCategory) => {
    switch (category) {
      case 'daily_logs':
        return <FileText className="w-4 h-4 text-sky-600" />;
      case 'inspections':
        return <ClipboardCheck className="w-4 h-4 text-amber-600" />;
      case 'manpower':
        return <Users className="w-4 h-4 text-emerald-600" />;
      case 'hauling':
        return <Truck className="w-4 h-4 text-indigo-600" />;
      case 'photos':
        return <Camera className="w-4 h-4 text-rose-600" />;
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Project Search"
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-16 p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-200 bg-slate-50/50">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search logs, inspections, payroll, haulers, photos... (e.g. Day 1, PF-0, Rebar)"
            className="w-full bg-transparent text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              aria-label="Clear search input"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded">
              ESC to close
            </kbd>
          )}
        </div>

        {/* Category Pills (Visible when results exist) */}
        {allResults.length > 0 && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-white overflow-x-auto text-xs shrink-0">
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('all')}
              className={`px-2.5 py-1 rounded-full font-medium transition cursor-pointer shrink-0 ${
                activeCategoryFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({allResults.length})
            </button>
            {categoryGroups.map((g) => (
              <button
                key={g.category}
                type="button"
                onClick={() => setActiveCategoryFilter(g.category)}
                className={`px-2.5 py-1 rounded-full font-medium transition cursor-pointer shrink-0 flex items-center gap-1 ${
                  activeCategoryFilter === g.category
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{g.label.split(' ')[0]}</span>
                <span className="opacity-80">({g.items.length})</span>
              </button>
            ))}
          </div>
        )}

        {/* Results Container */}
        <div ref={listRef} className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
          {query.trim().length === 0 ? (
            <div className="py-6 px-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Quick Jump Recommendations</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onSelectResult({
                      id: 'nav-daily-logs',
                      category: 'daily_logs',
                      title: 'Daily Logs',
                      subtitle: 'Jump to daily reports',
                      navigation: { tab: 'daily_logs' },
                    });
                    onClose();
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 text-left transition cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-sky-600 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-800">Latest Daily Logs</div>
                    <div className="text-[11px] text-slate-500">
                      {project.dailyLogs.length} logs recorded
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectResult({
                      id: 'nav-inspections',
                      category: 'inspections',
                      title: 'Foundation Inspection',
                      subtitle: 'Jump to foundation status',
                      navigation: { tab: 'inspection', phase: 'foundation' },
                    });
                    onClose();
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 text-left transition cursor-pointer"
                >
                  <ClipboardCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-800">Foundations Checklist</div>
                    <div className="text-[11px] text-slate-500">
                      {project.foundations.length} foundation pads
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectResult({
                      id: 'nav-manpower',
                      category: 'manpower',
                      title: 'Manpower & Payroll',
                      subtitle: 'Jump to payroll ledger',
                      navigation: { tab: 'manpower' },
                    });
                    onClose();
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 text-left transition cursor-pointer"
                >
                  <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-800">Manpower & Payroll</div>
                    <div className="text-[11px] text-slate-500">
                      Roster, civil works & haulers
                    </div>
                  </div>
                </button>

                {onOpenPhotoGallery && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPhotoGallery();
                    }}
                    className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 text-left transition cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-rose-600 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-800">Photo Gallery</div>
                      <div className="text-[11px] text-slate-500">
                        View staged vs cloud photos
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold text-slate-600">No matching records found</p>
              <p className="text-xs text-slate-400 mt-0.5">
                No logs, foundations, payroll, or photos match &quot;{query}&quot;
              </p>
            </div>
          ) : (
            filteredResults.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onClick={() => {
                    onSelectResult(item);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`group flex items-start gap-3 p-3 rounded-lg cursor-pointer transition ${
                    isSelected
                      ? 'bg-sky-50 text-slate-900 ring-1 ring-sky-300'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {/* Photo Thumbnail or Category Icon */}
                  {item.photoUrl ? (
                    <img
                      src={item.photoUrl}
                      alt={item.title}
                      className="w-12 h-12 object-cover rounded-md border border-slate-200 shrink-0 bg-slate-100"
                    />
                  ) : (
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-white border-sky-300'
                          : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      {renderCategoryIcon(item.category)}
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-slate-900 group-hover:text-sky-700">
                        {item.title}
                      </span>
                      {item.badge && (
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            item.badgeTone === 'amber'
                              ? 'bg-amber-100 text-amber-800'
                              : item.badgeTone === 'emerald'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.badgeTone === 'indigo'
                              ? 'bg-indigo-100 text-indigo-800'
                              : item.badgeTone === 'rose'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {item.subtitle}
                    </p>

                    {item.snippet && (
                      <p className="text-[11px] text-slate-600 bg-slate-100/70 rounded px-1.5 py-0.5 mt-1 line-clamp-2 font-mono">
                        {item.snippet}
                      </p>
                    )}
                  </div>

                  {/* Arrow Indicator */}
                  <div className="shrink-0 self-center pl-1 text-slate-400 group-hover:text-sky-600">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Keyboard Footer */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span>
              <kbd className="font-mono bg-white border border-slate-200 px-1 rounded shadow-2xs">↑</kbd>{' '}
              <kbd className="font-mono bg-white border border-slate-200 px-1 rounded shadow-2xs">↓</kbd> to navigate
            </span>
            <span>•</span>
            <span>
              <kbd className="font-mono bg-white border border-slate-200 px-1.5 rounded shadow-2xs">↵</kbd> to select
            </span>
          </div>
          <div className="font-mono text-[10px] text-slate-400">
            {filteredResults.length} {filteredResults.length === 1 ? 'match' : 'matches'}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
