   ti_domain="local domain";
   ti_server="";
   ti_desktopid="";
   ti_hardwareid="";
var desktop = JSON.parse(localStorage.getItem("desktop"));
if(desktop == null){
    location.href = "../login.html";
}
//var desktop = JSON.parse($.cookie("desktop"));
Thinticket=desktop.ticket.substring(0, desktop.ticket.length-1);
//Thinticket="oTXi8dANmOBdsmdPw5b13ClX8mOajx0ntmVyQ/1S31AcA2rsZw/GJi3qo3zdTzgcLuwIWpqt9yqG7F2ANIkVaZD5xW3ot5qm+H0f7mDa+VDKZT/i2QJ1hbdEOgeJlyezayCRP8b7WkXmthCiB7KimHgkmCTqvmTPDzkVzNrFOZE=";
Thinticket=Base64.decode(Thinticket);
function get_domainlist()
{        
        var xmlhttp;
        if (window.XMLHttpRequest)
        {// code for IE7+, Firefox, Chrome, Opera, Safari
                xmlhttp=new XMLHttpRequest();
        }
        else
        {// code for IE6, IE5
                xmlhttp=new ActiveXObject("Microsoft.XMLHTTP");
        }
        xmlhttp.onreadystatechange=function()
        {
                if (xmlhttp.readyState==4 && xmlhttp.status==200)
                {
                        var status=xmlhttp.responseText;//服务器返回
                        ovd_tilogin();
                }
        }
		ti_hardwareid=get_data(status,"hardware_id");
        xmlhttp.open("GET","https://192.168.3.205/ovd/terminal/domain_list",false);//传递参数，用户名和密码
	    xmlhttp.send();

 /* var url = 'https://192.168.3.205/ovd/terminal/domain_list';  
  var type= 'GET';
      $.ajax(url, type,{  
       /* data: {  
          'username': '18482187144',  
          'password': 'hejunxiong130??',      
        },  
        dataType: 'jsonp',  
        crossDomain: true,  
        success: function(data) {  
          if(data && data.resultcode == '200'){  
            //console.log(data.result.today);  
          }  
        }  
      });*/
		}
function ovd_tilogin()
{        
        var xmlhttp;
        if (window.XMLHttpRequest)
        {// code for IE7+, Firefox, Chrome, Opera, Safari
                xmlhttp=new XMLHttpRequest();
        }
        else
        {// code for IE6, IE5
                xmlhttp=new ActiveXObject("Microsoft.XMLHTTP");
        }
        xmlhttp.onreadystatechange=function()
        {
                if (xmlhttp.readyState==4 && xmlhttp.status==200)
                {
                        var status=xmlhttp.responseText;//服务器返回
			ti_desktopid=get_data(status,"desktop_id");
                        tiheart_beat();
                 }
        }
		var url="https://192.168.3.205:443/ovd/terminal/user_login?username=test&password=123456&domain="+ti_domain;
                xmlhttp.open("POST",url,false);//传递参数，用户名和密码
	        xmlhttp.send();
		
		}
function tiheart_beat()
{        
        var xmlhttp;
        if (window.XMLHttpRequest)
        {// code for IE7+, Firefox, Chrome, Opera, Safari
                xmlhttp=new XMLHttpRequest();
        }
        else
        {// code for IE6, IE5
                xmlhttp=new ActiveXObject("Microsoft.XMLHTTP");
        }
        xmlhttp.onreadystatechange=function()
        {
                if (xmlhttp.readyState==4 && xmlhttp.status==200)
                {
                        var status=xmlhttp.responseText;//服务器返回
			ti_server=get_data(status,"server");
                        vm_login();
                }
        }
		var url="https://192.168.3.205:443/ovd/terminal/heart_beat?username=test&password=123456&domain="+ti_domain;
        xmlhttp.open("POST",url,false);//传递参数，用户名和密码
       // xmlhttp.setRequestHeader("Access-Control-Allow-Origin", "*");       
	    xmlhttp.send();
		//"https://192.168.3.205:443/ovd/terminal/get_desktop_ip?username=test&domain=local domain&server=192.168.3.206&desktop_id=4e6cd73e-da21-11e6-9364-0025907d1cd4&hardware_id=QjYtOEYtMTUtQkUtOTMtRjM="
		}
function vm_login()
{        
        var xmlhttp;
        if (window.XMLHttpRequest)
        {// code for IE7+, Firefox, Chrome, Opera, Safari
                xmlhttp=new XMLHttpRequest();
        }
        else
        {// code for IE6, IE5
                xmlhttp=new ActiveXObject("Microsoft.XMLHTTP");
        }
        xmlhttp.onreadystatechange=function()
        {
                if (xmlhttp.readyState==4 && xmlhttp.status==200)
                {
                        var status=xmlhttp.responseText;//服务器返回
		        status=get_data(status,"ticket");
                        Thinticket=status;
                }
        }
		//"https://192.168.3.205:443/ovd/terminal/get_desktop_ip?username=test&domain=local domain&server=192.168.3.206&desktop_id=4e6cd73e-da21-11e6-9364-0025907d1cd4&hardware_id=QjYtOEYtMTUtQkUtOTMtRjM="
		var url="https://192.168.3.205:443/ovd/terminal/get_desktop_ip?username=test&domain="+ti_domain+"&server="+ti_server+"&desktop_id="+ti_desktopid+"&hardware_id="+ti_hardwareid;
                xmlhttp.open("POST",url,false);//传递参数，用户名和密码
	        xmlhttp.send();
		
		}
function get_data(responsetext,datatype)
		{
		    var res;
		    if(datatype=="ticket")
			{
				var n1=responsetext.indexOf("ticket")+10;  //获得ticket起始位置
				var n2=responsetext.indexOf("password")-4;  //获得ticket结束位置
				res=responsetext.substring(n1,n2);
				return res;
			}
		    if(datatype=="server")
			{
				var n1=responsetext.indexOf("server\"")+10;  //获得server起始位置
				var n2=responsetext.indexOf("ostype")-4;  //获得server结束位置
				res=responsetext.substring(n1,n2);
				return res;
			}
		    if(datatype=="desktop_id")
			{
				var n1=responsetext.indexOf("id")+6;  //获得desktop_id起始位置
				var n2=responsetext.indexOf("name")-4;  //获得desktop_id结束位置
				res=responsetext.substring(n1,n2);
				return res;
			}
		    if(datatype=="hardware_id")
			{
                //已写死
				return "QjYtOEYtMTUtQkUtOTMtRjM=";
			}
			if(datatype=="domain")
			{
			   //return "null";
			}
			return "No this datatype";
		}
/*authenticator = {
	thin_magic: 305419896,
	hardware_id: MD5("QjYtOEYtMTUtQkUtOTMtRjM=").substr(8,16),
	password: ""
             };*/
//hardware_idtest=MD5("QjYtOEYtMTUtQkUtOTMtRjM=").substr(8,16);
//authenticator='xV4\x121c008edlf3b39473';
authenticator='\x78\x56\x34\x12eb6e59f26b91eb6a';
