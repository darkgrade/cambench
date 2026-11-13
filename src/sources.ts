/**
 * Who a reading comes from, as the views group them: the camera's maker, each big site by name, launch
 * news, the used market, and every other site together. Used when the data is built and on a camera's page.
 */
export const SOURCE_GROUPS = [
    { id: 'maker', label: 'The maker' },
    { id: 'bh', label: 'B&H' },
    { id: 'dpreview', label: 'DPReview' },
    { id: 'wikipedia', label: 'Wikipedia' },
    { id: 'crutchfield', label: 'Crutchfield' },
    { id: 'wex', label: 'Wex' },
    { id: 'adorama', label: 'Adorama' },
    { id: 'news', label: 'Launch news' },
    { id: 'other', label: 'Other sites' },
    { id: 'used', label: 'Used market' },
]

const GROUP_OF_OWNER: Record<string, string> = { 'B&H': 'bh', DPReview: 'dpreview', Wikipedia: 'wikipedia', Crutchfield: 'crutchfield', Wex: 'wex', Adorama: 'adorama', MPB: 'used', eBay: 'used' }

/** The index in SOURCE_GROUPS of whoever stands behind a reading. */
export function sourceGroup(owner: string, isMaker: boolean, isNews: boolean): number {
    const id = isMaker ? 'maker' : (GROUP_OF_OWNER[owner] ?? (isNews ? 'news' : 'other'))
    return SOURCE_GROUPS.findIndex(group => group.id === id)
}
