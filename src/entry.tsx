import { BENCH, type CameraDetail, type CameraSummary, TABS, embeddedDetail } from '@site/data'
import { Shell, tabPath } from '@site/kit/shell'
import { CameraPage } from '@site/pages/camera'

/**
 * One camera's own page, in the same frame as the overview: these are the pages search engines land on.
 * Its tabs are plain links to the overview's views. The server render passes the camera's detail; a
 * browser reads the copy embedded in its page.
 */
export function Entry({ camera, detail }: { camera: CameraSummary; detail?: CameraDetail }) {
    return (
        <Shell bench={BENCH} tabs={TABS} tab="" onTab={id => location.assign(tabPath(BENCH, TABS, id))}>
            <div className="h-full overflow-y-auto">
                <CameraPage camera={camera} detail={detail ?? embeddedDetail()} />
            </div>
        </Shell>
    )
}
