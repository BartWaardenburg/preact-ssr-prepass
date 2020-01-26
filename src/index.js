import { assign, getChildren } from './util';
import { options, Fragment } from 'preact';

const createContextDefaultValue = '__p';

/*::
type VNode = {
};

type Options = {
	render: (vnode: VNode) => void;
};
*/

export default function prepass(
	vnode/*: VNode */, 
	// TODO: Support a visitor function
	visitor/*: ?(vnode: VNode, component: Component) => ?Promise<any> */,
	context/*: ?Object */,
)/*: Promise<void|Array<void>> */ {
	// null, boolean, text, number "vnodes" need to prepassing...
	if (vnode==null || typeof vnode!=='object') {
		return Promise.resolve();
	}

	let nodeName = vnode.type,
		props = vnode.props,
		children = [];
	context = context || {};

	if (typeof nodeName==='function' && nodeName !== Fragment) {
		let doRender/* : () => Promise<void> */;
		let c = vnode.__c = { __v: vnode, context, props };
		if (options.render) options.render(vnode);

		let isClassComponent = false;

		if (!nodeName.prototype || typeof nodeName.prototype.render!=='function') {
			// Necessary for createContext api. Setting this property will pass
			// the context value as `this.context` just for this component.
			let cxType = nodeName.contextType;
			let provider = cxType && context[cxType.__c];
			let cctx = cxType != null ? (provider ? provider.props.value : cxType[createContextDefaultValue]) : context;

			// stateless functional components
			doRender = () => {
				try {
				  vnode.__c = c = new Component(props, context);
				  return Promise.resolve(nodeName.call(vnode.__c, props, cctx));
				}
				catch (e) {
					if (e && e.then) {
						return e.then(doRender, doRender);
					}

					return Promise.reject(e);
				}
			};
		}
		else {
			isClassComponent= true;
			// class-based components
			// c = new nodeName(props, context);
			c = vnode.__c = new nodeName(props, context);
			c.__v = vnode;
			c.props = props;
			c.context = context;

			// TODO: does react-ssr-prepass call the visitor before lifecycle hooks?
			if (nodeName.getDerivedStateFromProps) c.state = assign(assign({}, c.state), nodeName.getDerivedStateFromProps(c.props, c.state));
			else if (c.componentWillMount) c.componentWillMount();
			
			doRender = () => {
				try {
					return Promise.resolve(c.render(c.props, c.state || {}, c.context));
				}
				catch (e) {
					if (e && e.then) {
						return e.then(doRender, doRender);
					}

					return Promise.reject(e);
				}
			};
		}

		return (visitor 
			? (visitor(vnode, isClassComponent ? c : undefined) || Promise.resolve()).then(doRender)
			: doRender())
			.then((rendered) => {
				if (c.getChildContext) {
					context = assign(assign({}, context), c.getChildContext());
				}
		
				return prepass(rendered, visitor, context);
			});
	}

	if (props && getChildren(children = [], props.children).length) {
		return Promise.all(children
			.map((child) => prepass(child, visitor, context)));
	}
    
	return Promise.resolve();
}
