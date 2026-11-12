import { RUN } from '@site/data'

const HEADINGS: Record<string, string> = {
    sources: 'Where the specs come from',
    reading: 'Reading each page',
    verification: 'Verified',
    level: 'The spec level',
}

/** How the specs are gathered and verified, from the method recorded in the results file. */
export function Method() {
    return (
        <div className="typeset typeset-kevinschaich max-w-3xl">
            <h2>How we verify</h2>
            {Object.entries(RUN.method ?? {}).map(([key, text]) => (
                <section key={key}>
                    <h3>{HEADINGS[key] ?? key}</h3>
                    <p>{text}</p>
                </section>
            ))}
            <h3>Sources</h3>
            <ul>
                {RUN.sources.map(source => (
                    <li key={source.key}>
                        {source.title}
                        {source.trusted ? ' (trusted)' : ''}
                    </li>
                ))}
            </ul>
            {RUN.date && <p>Published {new Date(RUN.date).toLocaleDateString('en-US', { dateStyle: 'long' })}.</p>}
        </div>
    )
}
