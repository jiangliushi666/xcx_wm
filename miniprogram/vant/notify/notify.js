import { WHITE } from '../common/color';
const defaultOptions = {
  selector: '#van-notify',
  type: 'danger',
  message: '',
  background: '',
  duration: 3000,
  zIndex: 110,
  top: 0,
  color: WHITE,
  safeAreaInsetTop: false,
  onClick: () => {},
  onOpened: () => {},
  onClose: () => {},
};
function parseOptions(message) {
  if (message == null) {
    return {};
  }
  return typeof message === 'string' ? { message } : message;
}
function getContext() {
  const pages = getCurrentPages();
  return pages[pages.length - 1];
}
export default function Notify(options) {
  options = Object.assign(
    Object.assign({}, defaultOptions),
    parseOptions(options)
  );
  const context = options.context || getContext();
  const notify = context.selectComponent(options.selector);
  delete options.context;
  delete options.selector;
  if (notify) {
    notify.setData(options);
    notify.show();
    return notify;
  }
  }
Notify.clear = function (options) {
  options = Object.assign(
    Object.assign({}, defaultOptions),
    parseOptions(options)
  );
  const context = options.context || getContext();
  const notify = context.selectComponent(options.selector);
  if (notify) {
    notify.hide();
  }
};
