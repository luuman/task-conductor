import { Icon, type IconProps } from '../Icon'
export function IconGripHorizontal(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="9" r="1" fill="currentColor" />
      <circle cx="19" cy="9" r="1" fill="currentColor" />
      <circle cx="5" cy="9" r="1" fill="currentColor" />
      <circle cx="12" cy="15" r="1" fill="currentColor" />
      <circle cx="19" cy="15" r="1" fill="currentColor" />
      <circle cx="5" cy="15" r="1" fill="currentColor" />
    </Icon>
  )
}
