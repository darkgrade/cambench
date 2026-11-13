import { RUN } from '@site/data'
import facts from '@site/facts.json'
import { STATUS } from '@site/readings'

const NEED = RUN.need ?? 3

export const METHOD_SECTIONS: { id: string; heading: string }[] = [
    { id: 'sources', heading: 'Where the specs come from' },
    { id: 'reading', heading: 'Reading each page' },
    { id: 'verification', heading: 'Verified' },
    { id: 'level', heading: 'The spec level' },
]

/** Who stands behind a source, in words: sites of one company count as one voice. */
const OWNERS: Record<string, string> = { maker: "The camera's maker", news: 'Each news site on its own' }

/** What each standing of a value means, in the order the site colors them. */
const STANDINGS: { status: string; meaning: string }[] = [
    { status: 'verified', meaning: `${NEED} or more independent sources state the same value. A few others stating something else does not change that.` },
    { status: 'likely', meaning: 'Two independent sources state the same value and none states another.' },
    { status: 'single', meaning: 'One source states it and no other source mentions it.' },
    { status: 'disputed', meaning: `Sources state different values and fewer than ${NEED} agree on any of them. The value shown is the one with the most behind it.` },
    { status: 'quote', meaning: 'A price. Prices change by the day, so each is shown as a seller listed it, with the date it was read.' },
]

/** Text from the results file, with `code` in backticks set as code. */
function Prose({ text }: { text: string }) {
    return <p>{text.split('`').map((part, index) => (index % 2 ? <code key={index}>{part}</code> : part))}</p>
}

/** How the specs are gathered and verified, from the method recorded in the results file. */
export function Method() {
    const method = RUN.method ?? {}
    return (
        <>
            <h2 id="method">How we verify</h2>
            <p>
                A camera's specs are published in many places, and they do not always match. Cambench reads each camera everywhere it is listed, keeps the words each value was read from, and
                only calls a value verified when independent sources agree on it.
            </p>
            {METHOD_SECTIONS.filter(section => method[section.id]).map(section => (
                <section key={section.id}>
                    <h3 id={section.id}>{section.heading}</h3>
                    <Prose text={method[section.id]} />
                    {section.id === 'sources' && (
                        <table>
                            <thead>
                                <tr>
                                    <th>Source</th>
                                    <th>Who stands behind it</th>
                                    <th>Breaks a tie</th>
                                </tr>
                            </thead>
                            <tbody>
                                {RUN.sources.map(source => (
                                    <tr key={source.key}>
                                        <td>{source.title}</td>
                                        <td>{OWNERS[source.owner] ?? source.owner}</td>
                                        <td>{source.trusted ? 'Yes' : 'No'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {section.id === 'sources' && (
                        <p>
                            Other shops and review sites that publish a spec sheet for a camera are read too, each as its own source. When two values have the same number of sources behind
                            them, the one the maker or B&H states is listed.
                        </p>
                    )}
                    {section.id === 'verification' && (
                        <dl>
                            {STANDINGS.map(standing => (
                                <div key={standing.status}>
                                    <dt>
                                        <span className="mr-2 inline-block size-2 rounded-full align-middle" style={{ background: STATUS[standing.status].color }} />
                                        {STATUS[standing.status].label}
                                    </dt>
                                    <dd>{standing.meaning}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    {section.id === 'level' && (
                        <table>
                            <thead>
                                <tr>
                                    <th>Area</th>
                                    <th>Counts for</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...facts.areas]
                                    .sort((first, second) => second.weight - first.weight)
                                    .map(area => (
                                    <tr key={area.area}>
                                        <td>{area.area}</td>
                                        <td>{area.weight}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {section.id === 'level' && <p>An area a camera's sources say nothing about is left out and the rest count for more, so a missing value never counts against a camera.</p>}
                </section>
            ))}
        </>
    )
}
