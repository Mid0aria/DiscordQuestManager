/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ButtonCompat } from "@components/Button";
import { ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { React, showToast, ThemeStore, useEffect, useMemo, useState } from "@webpack/common";

import { vpnClient } from "../api/vpnClient";
import { settings } from "../settings";

export const DEFAULT_POPULAR_REGIONS = [
    "smart",
    "usa-new-york",
    "usa-los-angeles-1",
    "germany-frankfurt-1",
    "germany-berlin",
    "uk-london",
    "turkey",
    "japan-tokyo",
    "france-paris-1",
    "canada-toronto",
    "singapore",
    "netherlands-amsterdam",
    "australia-sydney",
    "brazil",
    "italy-milan",
    "spain-barcelona",
    "switzerland",
    "sweden",
    "poland",
    "hong-kong-1",
    "south-korea"
];

export function formatRegionName(slug: string): string {
    if (slug === "smart") return "⚡ Smart Location (Fastest / Recommended)";
    return slug
        .split("-")
        .map(word => {
            const lower = word.toLowerCase();
            if (["usa", "uk", "uae", "de", "jp", "tr"].includes(lower)) return lower.toUpperCase();
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(" ");
}

type RegionChangeListener = (regions: string) => void;
const regionChangeListeners = new Set<RegionChangeListener>();

export function addRegionChangeListener(fn: RegionChangeListener) {
    regionChangeListeners.add(fn);
    return () => { regionChangeListeners.delete(fn); };
}

export function notifyRegionChange(newVal: string) {
    settings.store.vpnTargetRegions = newVal;
    for (const fn of regionChangeListeners) {
        try { fn(newVal); } catch {}
    }
}

interface RegionPickerModalProps {
    props: any;
}

export function RegionPickerModal({ props }: RegionPickerModalProps) {
    const [selected, setSelected] = useState<Set<string>>(() => {
        const raw = settings.store.vpnTargetRegions || "smart, usa-new-york, germany-frankfurt-1, uk-london";
        const items = raw.split(",").map(r => r.trim()).filter(Boolean);
        return new Set(items);
    });

    const [allRegions, setAllRegions] = useState<string[]>(DEFAULT_POPULAR_REGIONS);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        vpnClient.getRegions()
            .then(liveRegions => {
                if (mounted && liveRegions && liveRegions.length > 0) {
                    // Combine live with defaults so "smart" is at top
                    const set = new Set(["smart", ...liveRegions]);
                    setAllRegions(Array.from(set));
                }
            })
            .catch(() => {
                // Keep default popular regions if offline
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });

        return () => { mounted = false; };
    }, []);

    const filteredRegions = useMemo(() => {
        const query = search.toLowerCase().trim();
        if (!query) return allRegions;
        return allRegions.filter(slug => {
            const formatted = formatRegionName(slug).toLowerCase();
            return slug.toLowerCase().includes(query) || formatted.includes(query);
        });
    }, [allRegions, search]);

    const toggleRegion = (slug: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(slug)) next.delete(slug);
            else next.add(slug);
            return next;
        });
    };

    const handleSelectPopular = () => {
        setSelected(new Set(["smart", "usa-new-york", "germany-frankfurt-1", "uk-london", "turkey", "japan-tokyo"]));
    };

    const handleSelectAllFiltered = () => {
        setSelected(prev => {
            const next = new Set(prev);
            for (const r of filteredRegions) next.add(r);
            return next;
        });
    };

    const handleClearAll = () => {
        setSelected(new Set());
    };

    const handleSave = () => {
        const array = Array.from(selected);
        const value = array.length > 0 ? array.join(", ") : "smart";
        notifyRegionChange(value);
        showToast({ text: `Saved ${array.length} target region(s)! 🌍`, variant: "success" });
        props.onClose?.();
    };

    const ModalRootCmp = ModalRoot as any;
    const ModalContentCmp = ModalContent as any;
    const ModalHeaderCmp = ModalHeader as any;
    const theme = ThemeStore?.theme || "dark";

    return (
        <ModalRootCmp
            {...props}
            size={ModalSize.DYNAMIC}
            className={`vc-quest-modal-root theme-${theme}`}
        >
            <ModalHeaderCmp separator={false} style={{ padding: "20px 24px 10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "var(--header-primary, #ffffff)" }}>
                        🌍 Select ExpressVPN Target Regions
                    </h2>
                    <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted, #b5bac1)" }}>
                        Check the countries/cities to scan for region-exclusive Discord quests.
                    </p>
                </div>
                <div className="vc-quest-hero-badge" style={{ margin: 0, padding: "6px 12px" }}>
                    {selected.size} Selected
                </div>
            </ModalHeaderCmp>

            <ModalContentCmp style={{ padding: "0 24px 20px 24px", width: "540px", maxWidth: "90vw" }}>
                {/* Search Bar */}
                <div style={{ margin: "10px 0 12px 0" }}>
                    <input
                        className="vc-quest-debug-input"
                        placeholder="🔍 Search country or city (e.g. usa, germany, turkey, japan, uk)..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box" }}
                    />
                </div>

                {/* Quick Selection Presets */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
                    <ButtonCompat
                        size={ButtonCompat.Sizes.MIN}
                        color={ButtonCompat.Colors.PRIMARY}
                        onClick={handleSelectPopular}
                    >
                        ⭐ Select Popular (US, UK, DE, TR, JP)
                    </ButtonCompat>
                    <ButtonCompat
                        size={ButtonCompat.Sizes.MIN}
                        color={ButtonCompat.Colors.PRIMARY}
                        onClick={handleSelectAllFiltered}
                    >
                        ✓ Select All ({filteredRegions.length})
                    </ButtonCompat>
                    <ButtonCompat
                        size={ButtonCompat.Sizes.MIN}
                        color={ButtonCompat.Colors.RED}
                        onClick={handleClearAll}
                    >
                        ✕ Clear All
                    </ButtonCompat>
                    {loading && (
                        <span style={{ fontSize: "12px", color: "var(--text-muted, #b5bac1)", alignSelf: "center", marginLeft: "auto" }}>
                            Fetching server regions...
                        </span>
                    )}
                </div>

                {/* Scrollable Region Checkbox List */}
                <div
                    className="vc-quest-region-list"
                    style={{
                        maxHeight: "340px",
                        overflowY: "auto",
                        background: "var(--background-secondary, #2b2d31)",
                        borderRadius: "8px",
                        border: "1px solid var(--background-modifier-accent, #3f4147)",
                        padding: "6px"
                    }}
                >
                    {filteredRegions.length === 0 ? (
                        <div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted, #b5bac1)", fontSize: "13px" }}>
                            No regions found matching "{search}".
                        </div>
                    ) : (
                        filteredRegions.map(slug => {
                            const isChecked = selected.has(slug);
                            return (
                                <div
                                    key={slug}
                                    onClick={() => toggleRegion(slug)}
                                    className={`vc-quest-region-item ${isChecked ? "selected" : ""}`}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "8px 12px",
                                        borderRadius: "6px",
                                        cursor: "pointer",
                                        marginBottom: "2px",
                                        background: isChecked ? "var(--background-modifier-selected, rgba(88, 101, 242, 0.15))" : "transparent",
                                        transition: "background 0.15s ease"
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleRegion(slug)}
                                            style={{ cursor: "pointer", width: "16px", height: "16px", accentColor: "#5865f2" }}
                                            onClick={e => e.stopPropagation()}
                                        />
                                        <span style={{ fontWeight: isChecked ? 600 : 400, color: isChecked ? "var(--header-primary, #ffffff)" : "var(--text-normal, #dbdee1)", fontSize: "13.5px" }}>
                                            {formatRegionName(slug)}
                                        </span>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: "11px",
                                            padding: "2px 6px",
                                            borderRadius: "4px",
                                            background: "var(--background-tertiary, #1e1f22)",
                                            color: "var(--text-muted, #949ba4)",
                                            fontFamily: "monospace"
                                        }}
                                    >
                                        {slug}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Bottom Actions */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "16px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #b5bac1)" }}>
                        {selected.size} region(s) will be scanned when VPN Geo-Scan runs.
                    </span>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <ButtonCompat
                            color={ButtonCompat.Colors.PRIMARY}
                            look={ButtonCompat.Looks.LINK}
                            onClick={() => props.onClose?.()}
                        >
                            Cancel
                        </ButtonCompat>
                        <ButtonCompat
                            color={ButtonCompat.Colors.BRAND}
                            onClick={handleSave}
                        >
                            💾 Save Target Regions
                        </ButtonCompat>
                    </div>
                </div>
            </ModalContentCmp>
        </ModalRootCmp>
    );
}

export function openRegionPickerModal() {
    openModal(modalProps => <RegionPickerModal props={modalProps} />);
}

export function RegionPickerSettingsButton() {
    const [regionsStr, setRegionsStr] = useState(() => settings.store.vpnTargetRegions || "smart, usa-new-york, germany-frankfurt-1, uk-london");

    useEffect(() => {
        return addRegionChangeListener(val => setRegionsStr(val));
    }, []);

    const items = regionsStr.split(",").map(r => r.trim()).filter(Boolean);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", marginTop: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <ButtonCompat
                    color={ButtonCompat.Colors.BRAND}
                    onClick={openRegionPickerModal}
                >
                    🗺️ Select Target Regions ({items.length} Selected)
                </ButtonCompat>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #b5bac1)" }}>
                    Click button to check/uncheck countries & regions
                </span>
            </div>
            <div style={{
                background: "var(--background-secondary, #2b2d31)",
                border: "1px solid var(--background-modifier-accent, #3f4147)",
                borderRadius: "8px",
                padding: "10px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "6px"
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted, #b5bac1)" }}>
                        Active Target Regions:
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted, #949ba4)" }}>
                        {items.length} active
                    </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {items.length === 0 ? (
                        <span style={{ fontSize: "12px", color: "var(--text-muted, #949ba4)" }}>
                            None selected (will default to Smart Location)
                        </span>
                    ) : (
                        items.map(slug => (
                            <span
                                key={slug}
                                style={{
                                    fontSize: "11.5px",
                                    padding: "3px 8px",
                                    borderRadius: "4px",
                                    background: "var(--background-tertiary, #1e1f22)",
                                    color: "var(--header-primary, #ffffff)",
                                    border: "1px solid rgba(88, 101, 242, 0.4)"
                                }}
                            >
                                {formatRegionName(slug)}
                            </span>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
