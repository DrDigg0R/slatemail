global.document= window.document;
global.navigator= window.navigator;
var $ = require('jquery');
var React = require('react');
// console.log(React);

function MailboxView(container){
	this.container = container;

	var BoxViewer = React.createClass({displayName: "BoxViewer",
		getInitialState:function(){
			return {data:[]};
		},
		render:function(){
			return (
				React.createElement("div", {className: "message_list"}, 
				React.createElement("h1", null, "Box Viewer"), 
				React.createElement(MessageList, {data: this.state.data})
				)
			);
		}
	});

	var MessageList = React.createClass({displayName: "MessageList",
		render: function(){
			var message_nodes = this.props.data.map(function(message_data){
				return (
					React.createElement(Message, {data: message_data})
				);
			});
			return (
				React.createElement("div", {className: "message_list"}, 
				message_nodes
				)
			);
		}
	});

	var Message = React.createClass({displayName: "Message",
		render: function(){

		}
	})

	React.render(React.createElement(BoxViewer, null), this.container[0]);
}
module.exports = MailboxView;
