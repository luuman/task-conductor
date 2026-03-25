import { Icon, type IconProps } from '../Icon'
export function IconBlocks(props: IconProps) {
  return (
    <Icon {...props}>
      <rect width="7" height="7" x="2" y="2" rx="1" />
      <rect width="7" height="7" x="15" y="2" rx="1" />
      <rect width="7" height="7" x="15" y="15" rx="1" />
      <rect width="7" height="7" x="2" y="15" rx="1" />
    </Icon>
  )
}
