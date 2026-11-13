/** Method: how the specs are gathered, read, verified and scored, set as an article with its contents beside it. */
import { RUN } from '@site/data'
import { TYPE } from '@site/kit/theme'
import { Method, METHOD_SECTIONS } from '@site/pages/method'

const CONTENTS = [{ id: 'method', heading: 'How we verify' }, ...METHOD_SECTIONS.filter(section => RUN.method?.[section.id])]

export function MethodView() {
    return (
        <div className="h-full overflow-y-auto scroll-smooth">
            <div className="mx-auto grid max-w-5xl gap-x-16 gap-y-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,37em)_1fr]">
                <article className="typeset typeset-kevinschaich">
                    <Method />
                </article>
                <aside className="row-start-1 flex flex-col gap-6 text-sm lg:sticky lg:top-8 lg:col-start-2 lg:self-start">
                    {RUN.date && (
                        <div className="flex flex-col gap-1">
                            <p className={TYPE.label}>Last read</p>
                            <p>{new Date(RUN.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
                        </div>
                    )}
                    <nav className="hidden flex-col gap-1.5 lg:flex" aria-label="On this page">
                        <p className={TYPE.label}>On this page</p>
                        {CONTENTS.map(item => (
                            <a key={item.id} href={`#${item.id}`} className="text-muted-foreground hover:text-foreground">
                                {item.heading}
                            </a>
                        ))}
                    </nav>
                </aside>
            </div>
        </div>
    )
}
