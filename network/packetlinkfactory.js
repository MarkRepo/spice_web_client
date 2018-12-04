

wdi.PacketLinkFactory = {
	extract: function(header, queue) {
		switch (header.type) {
			case wdi.SpiceVars.SPICE_MSG_SET_ACK:
				return new wdi.RedSetAck().demarshall(queue);
			case wdi.SpiceVars.SPICE_MSG_PING:
				return new wdi.RedPing().demarshall(queue, header.size);
			case wdi.SpiceVars.SPICE_MSG_MIGRATE:
				return new wdi.RedMigrate().demarshall(queue);
			case wdi.SpiceVars.SPICE_MSG_MIGRATE_DATA:
				return new wdi.RedMigrateData().demarshall(queue, header.size);
			case wdi.SpiceVars.SPICE_MSG_WAIT_FOR_CHANNELS:
				return new wdi.RedWaitForChannels().demarshall(queue);
			case wdi.SpiceVars.SPICE_MSG_DISCONNECTING:
				return new wdi.RedDisconnect().demarshall(queue);
			case wdi.SpiceVars.SPICE_MSG_NOTIFY:
				var packet = new wdi.RedNotify().demarshall(queue);
				return packet;
			case wdi.SpiceVars.SPICE_MSG_MAIN_MOUSE_MODE:
				return new wdi.SpiceMouseMode().demarshall(queue);
		}
	}
};

wdi.PacketLinkProcess = {
	process: function(header, packet, channel) {
		switch(header.type) {
			case wdi.SpiceVars.SPICE_MSG_SET_ACK:
				var body = wdi.SpiceObject.numberTo32(packet.generation);
				channel.setAckWindow(packet.window)
				channel.sendObject(body, wdi.SpiceVars.SPICE_MSGC_ACK_SYNC);
				break;
			case wdi.SpiceVars.SPICE_MSG_PING:
				var body = new wdi.RedPing({id: packet.id, time: packet.time}).marshall();
				var myDate = new Date();
				//console.log("channel: " + channel.channel + " recv SPICE_MSG_PING, time: " + myDate.toLocaleString());
				channel.sendObject(body, wdi.SpiceVars.SPICE_MSGC_PONG);
				break;
			case wdi.SpiceVars.SPICE_MSG_MAIN_MOUSE_MODE:
				channel.fire('mouseMode', packet.current_mode);
				break;
			case wdi.SpiceVars.SPICE_MSG_NOTIFY:
				channel.fire('notify');
				break;
		}
	}
};
