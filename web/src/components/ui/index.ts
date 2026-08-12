/**
 * Barrel for the design-system primitives (BLUEPRINT §7.2.3).
 * One primitive per file; this file only re-exports.
 */
export { Avatar, type AvatarProps } from "./Avatar";
export { Banner, BannerLink, type BannerProps, type BannerVariant } from "./Banner";
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./Button";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  type DropdownMenuItemProps,
  type DropdownMenuProps,
} from "./DropdownMenu";
export { Input, type InputProps } from "./Input";
export { Modal, type ModalProps } from "./Modal";
export {
  Popover,
  type PopoverPlacement,
  type PopoverProps,
  type PopoverTone,
} from "./Popover";
export { Radio, type RadioProps } from "./Radio";
export { Select, type SelectProps } from "./Select";
export { Spinner, type SpinnerProps } from "./Spinner";
export { Switch, type SwitchProps } from "./Switch";
export { TabPanel, Tabs, type TabItem, type TabsProps } from "./Tabs";
export {
  Toast,
  ToastProvider,
  useToast,
  type ToastOptions,
  type ToastProps,
  type ToastRecord,
} from "./Toast";
