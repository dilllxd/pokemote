import dgram from "dgram";

export interface DiscoveredTV {
  ip: string;
  location: string;
}

/**
 * Discovers LG TVs on the network using SSDP/UPnP
 */
export async function discoverTVs(timeout: number = 5000): Promise<DiscoveredTV[]> {
  return new Promise((resolve) => {
    const discovered = new Map<string, DiscoveredTV>();
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

    // SSDP M-SEARCH message
    const message = [
      "M-SEARCH * HTTP/1.1",
      "HOST: 239.255.255.250:1900",
      'MAN: "ssdp:discover"',
      "ST: urn:schemas-upnp-org:device:MediaRenderer:1",
      "MX: 3",
      "",
      "",
    ].join("\r\n");

    // Handle responses
    socket.on("message", async (msg, rinfo) => {
      const response = msg.toString();
      
      // Parse LOCATION header
      const locationMatch = response.match(/LOCATION:\s*(.+)/i);
      if (!locationMatch) return;

      const location = locationMatch[1].trim();
      
      // Validate it's an LG TV by checking the device description
      try {
        const response = await fetch(location, { 
          signal: AbortSignal.timeout(2000) 
        });
        const text = await response.text();
        
        if (text.toLowerCase().includes("lg")) {
          const url = new URL(location);
          discovered.set(rinfo.address, {
            ip: rinfo.address,
            location: location,
          });
        }
      } catch (err) {
        // Not an LG TV or request failed
      }
    });

    socket.on("error", (err) => {
      console.error("Discovery socket error:", err);
      socket.close();
    });

    socket.bind(() => {
      // Set multicast options
      socket.setMulticastTTL(2);
      
      // Send M-SEARCH to multicast address
      socket.send(
        message,
        0,
        message.length,
        1900,
        "239.255.255.250",
        (err) => {
          if (err) console.error("Send error:", err);
        }
      );

      // Close socket after timeout
      setTimeout(() => {
        socket.close();
        resolve(Array.from(discovered.values()));
      }, timeout);
    });
  });
}

