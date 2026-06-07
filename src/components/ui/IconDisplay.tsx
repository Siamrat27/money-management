import { isUrlIcon } from '../../lib/storage'

export default function IconDisplay({ icon }: { icon: string }) {
  if (isUrlIcon(icon)) {
    return <img src={icon} className="w-full h-full object-cover" alt="" />
  }
  return <>{icon}</>
}
